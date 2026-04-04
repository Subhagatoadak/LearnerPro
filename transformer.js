// transformer.js — Core transformer mathematics (d_model=8, n_heads=2, d_ff=16)

// Reproducible PRNG (Mulberry32)
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRandn(seed) {
  const r = mulberry32(seed);
  return (scale = 1) => {
    const u = r() + 1e-10, v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * scale;
  };
}

// Pure matrix operations on plain 2-D arrays
const M = {
  zeros: (r, c) => Array.from({ length: r }, () => new Array(c).fill(0)),

  rand: (r, c, randn, scale = 1) =>
    Array.from({ length: r }, () =>
      Array.from({ length: c }, () => randn(scale))
    ),

  mul(A, B) {
    const R = A.length, N = A[0].length, C = B[0].length;
    const out = M.zeros(R, C);
    for (let i = 0; i < R; i++)
      for (let k = 0; k < N; k++) {
        const a = A[i][k];
        if (a === 0) continue;
        for (let j = 0; j < C; j++) out[i][j] += a * B[k][j];
      }
    return out;
  },

  add: (A, B) => A.map((row, i) => row.map((v, j) => v + B[i][j])),

  addBias: (A, b) => A.map(row => row.map((v, j) => v + b[j])),

  T: A => Array.from({ length: A[0].length }, (_, j) =>
    Array.from({ length: A.length }, (_, i) => A[i][j])
  ),

  scale: (A, s) => A.map(row => row.map(v => v * s)),

  rowSoftmax(A) {
    return A.map(row => {
      const mx = Math.max(...row);
      const ex = row.map(v => Math.exp(v - mx));
      const s = ex.reduce((a, b) => a + b, 0);
      return ex.map(e => e / s);
    });
  },

  relu: A => A.map(row => row.map(v => Math.max(0, v))),

  layerNorm(A, eps = 1e-5) {
    return A.map(row => {
      const mean = row.reduce((a, b) => a + b, 0) / row.length;
      const std = Math.sqrt(
        row.reduce((a, b) => a + (b - mean) ** 2, 0) / row.length + eps
      );
      return row.map(v => (v - mean) / std);
    });
  },

  hcat: matrices =>
    matrices[0].map((_, i) => [].concat(...matrices.map(m => m[i]))),
};

// ─────────────────────────────────────────
const CONFIG = {
  D_MODEL: 8,
  N_HEADS: 2,
  D_HEAD: 4,
  D_FF: 16,
  VOCAB: [
    'the', 'a', 'cat', 'dog', 'sat', 'ran', 'on', 'mat',
    'big', 'small', 'happy', 'fast', 'red', 'is', 'and', 'with',
    'plays', 'jumps', 'over', 'under',
  ],
};

class TransformerModel {
  constructor() {
    const rng = makeRandn(1337);
    const { D_MODEL, N_HEADS, D_HEAD, D_FF, VOCAB } = CONFIG;
    const xavier = (r, c) => M.rand(r, c, rng, Math.sqrt(2 / (r + c)));

    // Token embeddings (vocab × d_model)
    this.embeddings = {};
    for (const w of VOCAB)
      this.embeddings[w] = Array.from({ length: D_MODEL }, () => rng(0.5));

    // Per-head projection matrices
    this.WQ = Array.from({ length: N_HEADS }, () => xavier(D_MODEL, D_HEAD));
    this.WK = Array.from({ length: N_HEADS }, () => xavier(D_MODEL, D_HEAD));
    this.WV = Array.from({ length: N_HEADS }, () => xavier(D_MODEL, D_HEAD));

    // Output projection
    this.WO = xavier(D_MODEL, D_MODEL);

    // FFN
    this.W1 = xavier(D_MODEL, D_FF);
    this.b1 = Array.from({ length: D_FF }, () => rng(0.1));
    this.W2 = xavier(D_FF, D_MODEL);
    this.b2 = Array.from({ length: D_MODEL }, () => rng(0.1));
  }

  positionalEncoding(seqLen) {
    const { D_MODEL } = CONFIG;
    return Array.from({ length: seqLen }, (_, pos) =>
      Array.from({ length: D_MODEL }, (_, i) =>
        i % 2 === 0
          ? Math.sin(pos / Math.pow(10000, i / D_MODEL))
          : Math.cos(pos / Math.pow(10000, (i - 1) / D_MODEL))
      )
    );
  }

  forward(tokens) {
    const { N_HEADS, D_HEAD, D_MODEL } = CONFIG;

    // 1. Token embeddings
    const embeddings = tokens.map(t =>
      this.embeddings[t] ? [...this.embeddings[t]] : new Array(D_MODEL).fill(0)
    );

    // 2. Positional encoding
    const pe = this.positionalEncoding(tokens.length);
    const withPE = M.add(embeddings, pe);

    // 3. Multi-head self-attention
    const heads = [];
    for (let h = 0; h < N_HEADS; h++) {
      const Q = M.mul(withPE, this.WQ[h]);
      const K = M.mul(withPE, this.WK[h]);
      const V = M.mul(withPE, this.WV[h]);
      const rawScores = M.mul(Q, M.T(K));
      const scores = M.scale(rawScores, 1 / Math.sqrt(D_HEAD));
      const attnWeights = M.rowSoftmax(scores);
      const headOut = M.mul(attnWeights, V);
      heads.push({ Q, K, V, rawScores, scores, attnWeights, headOut });
    }

    // Concatenate heads → output projection
    const concatHeads = M.hcat(heads.map(h => h.headOut));
    const attnOutput = M.mul(concatHeads, this.WO);

    // Add & Norm 1
    const addNorm1 = M.layerNorm(M.add(withPE, attnOutput));

    // FFN
    const ffn1 = M.addBias(M.mul(addNorm1, this.W1), this.b1);
    const ffnRelu = M.relu(ffn1);
    const ffn2 = M.addBias(M.mul(ffnRelu, this.W2), this.b2);

    // Add & Norm 2
    const output = M.layerNorm(M.add(addNorm1, ffn2));

    return {
      tokens, embeddings, pe, withPE,
      heads, concatHeads, attnOutput,
      addNorm1, ffn1, ffnRelu, ffn2, output,
    };
  }
}

window.TransformerModel = TransformerModel;
window.CONFIG = CONFIG;
window.M = M;
