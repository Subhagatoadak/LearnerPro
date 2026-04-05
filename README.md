# LearnerPro: Transformer Atlas

**An interactive, visual guide to understanding transformer models from first principles.**

[Live Demo](https://subhagatoadak.github.io/LearnerPro) | [GitHub Repo](https://github.com/Subhagatoadak/LearnerPro) | [Latest Release](https://github.com/Subhagatoadak/LearnerPro/releases)

---

## 🎯 Overview

LearnerPro is a **static GitHub Pages website** that demystifies how transformer neural networks process text. Built entirely in vanilla JavaScript with no backend required, it lets you:

- **Compose token sequences** and watch them transform through a neural network
- **Inspect every intermediate step** from embeddings to final outputs
- **Visualize attention patterns** showing which words look at which words
- **Play through multi-block stacks** to see how layering amplifies context
- **Explore advanced techniques** (KV caching, quantization, LoRA, distillation)

All computations happen **live in your browser**. No data leaves your machine.

---

## ✨ Key Features

### 🧠 Core Transformer Walkthrough

| Feature | What It Shows |
|---------|---------------|
| **Token Embeddings** | How each word maps to an 8-dimensional vector |
| **Positional Encoding** | Sinusoidal patterns inject sequence order |
| **Multi-Head Attention** | 2 attention heads showing query→key→value scoring |
| **Residual Connections** | How original signals skip through layers |
| **Layer Normalization** | Statistical stabilization per token |
| **Feed-Forward Network** | Expansion → ReLU → projection back to model width |

### 🎬 Cinematic Block Stack Animation

- **Play/Pause Controls:** Smooth animation through 1-4 stacked transformer blocks
- **Scrub Timeline:** Click to jump to any block, inspect its effects
- **Colored Token Chips:** Each token gets a unique hue that persists across blocks
- **Focus Shift Metric:** Shows L2 distance of tokens as they flow through blocks
- **Block Metrics:** Per-block attention & FFN activation statistics

### 🔍 Interactive Visualizations

- **Heatmaps:** Color-coded matrices for embeddings, attention, FFN activations
- **Attention Flows:** Animated arcs showing which words attend to which
- **Cosine Similarity:** Token-to-token relationship heatmaps
- **Bar Charts:** Vector component breakdowns with smooth tweening
- **Focus-Based Views:** Select any query/key token pair to inspect attention

### 🛠 Advanced Techniques Explorer

| Technique | Purpose |
|-----------|---------|
| **KV Caching** | Speedup trick for autoregressive generation (skip recomputing past K,V) |
| **Knowledge Distillation** | Train small models from large teacher models via soft targets |
| **Quantization** | Compress weights to INT2/INT4/INT8 for faster inference |
| **LoRA** | Efficient fine-tuning with low-rank weight updates |

---

## 🚀 Getting Started

### Quick Start

1. Open [the live demo](https://subhagatoadak.github.io/LearnerPro) in any modern browser
2. Select a preset sequence or build your own:
   - Click words in the **Token Palette** to build a sequence
   - Or load a **Preset Sequence** (Classic Sentence, Adjective Pair, etc.)
3. Watch the transformer pipeline animate:
   - Step through embeddings → attention → FFN → output
   - Use **Play Tour** to auto-step through all stages
   - Adjust **Speed** slider (0.5x to 3x)

### Multi-Block Exploration

1. In the **Stacked Encoder View**, adjust the **Blocks** slider (1-4)
2. Click **▶ Play Stack** to watch tokens flow through all blocks
3. Use the **Timeline** scrubber to jump to any block
4. Click any block card to inspect its internal computations
5. Watch the **Focus Token Shift** metric increase as context propagates

### Advanced Techniques

1. Scroll to **Efficiency & Adaptation** section
2. Use the technique tabs (KV Cache, Distillation, Quantization, LoRA)
3. Adjust sliders and dropdowns to see real-time impact
4. Inspect the FLOPs charts and error metrics

---

## 📐 Architecture & Mathematics

### Model Configuration

```javascript
D_MODEL = 8        // Embedding and hidden dimension
N_HEADS = 2        // Number of attention heads
D_HEAD  = 4        // Dimension per attention head
D_FF    = 16       // Hidden layer size in feed-forward
MAX_BLOCKS = 4     // Maximum stacked blocks
VOCAB   = 20 words // Embeddings for 20 common words
```

### Computation Graph

```
Input Tokens
    ↓
Token Embeddings (vocab_size × d_model)
    ↓
+ Positional Encoding (sinusoidal)
    ↓
[For each block in 1..num_blocks]:
    ├─ Multi-Head Attention
    │   ├─ Project to Q, K, V
    │   ├─ Compute Attention = softmax(Q·Kᵀ/√d_k)·V
    │   ├─ Concatenate heads
    │   └─ Output projection
    ├─ + Residual + LayerNorm
    │
    ├─ Feed-Forward (d_model → d_ff → d_model)
    │   ├─ Dense + Bias
    │   ├─ ReLU activation
    │   └─ Dense + Bias
    └─ + Residual + LayerNorm
        ↓
Output: Contextual vectors (seq_len × d_model)
```

### Formulas at a Glance

| Operation | Formula |
|-----------|---------|
| **Attention** | `softmax(QKᵀ / √d_k) · V` |
| **Residual** | `x + f(x)` where f is attention or FFN |
| **LayerNorm** | `(v - μ) / √(σ² + ε)` per token |
| **Positional** | `sin(pos / 10000^(2k/d))` and `cos(pos / 10000^(2k/d))` |
| **FFN** | `ReLU(x·W₁ + b₁)·W₂ + b₂` |

---

## 🎨 Visual Design

### Color Scheme

- **Cyan** (`#60d7ff`): Primary highlights, query tokens, attention weights
- **Teal** (`#8ef2ca`): Secondary accent, key/value tokens, positive values
- **Sand** (`#f4d8ab`): Tertiary accent, labels, metadata
- **Orange** (`#ff8f4d`): Negative values, warm emphasis
- **Dark Blue** (`#07131b`): Background with grid overlay

### Animation Principles

- **Easing:** Cubic-out for step cards (bouncy), ease for transitions (smooth)
- **Timing:** 420ms for major state changes, 200ms for emphasis
- **Stagger:** Token animations delayed by 70ms each for cascade effect
- **Momentum:** SVG transitions use d3.js for organic motion

---

## 🔧 Technical Stack

### Frontend

```
HTML5           → Semantic structure, canvas elements
CSS3            → Flexbox/Grid, transitions, media queries
Vanilla JS      → No framework, ~1700 lines
D3.js v7        → SVG charts, animated transitions
Canvas API      → High-performance heatmaps
```

### Math Library

Custom matrix operations (no dependencies):
- Matrix multiplication with sparse handling
- Softmax normalization
- Layer normalization
- Cosine similarity
- All operations use plain 2D arrays (seq_len × dims)

### Performance Optimizations

| Optimization | Technique |
|--------------|-----------|
| **Sparse MatMul** | Skip multiplying by zeros in matrix multiply |
| **Canvas Rendering** | 2D canvas for heatmaps (faster than DOM) |
| **WeakMap Tweens** | Automatic cleanup of animation frames |
| **Debounced Resize** | Redraw only 120ms after resize stops |
| **RAF Throttling** | Respect 60fps cap for smooth animation |

---

## 📊 File Structure

```
LearnerPro/
├── index.html              (909 lines)  Main page structure
├── main.js                 (1717 lines) Core visualization & interaction
├── transformer.js          (234 lines)  Math operations & forward pass
├── techniques.js           (~400 lines) Advanced technique simulations
├── styles.css              (1546 lines) Responsive design & animations
├── README.md               (this file) Documentation
├── PATCH_SUMMARY.md        (detailed changelog)
└── .gitignore              (standard)
```

### Key Functions

#### main.js

```javascript
// State Management
run()                    // Trigger full recomputation
redrawCurrentView()      // Update current block visualization

// Animation Control
startStagePlay()         // Begin smooth block animation
stopStagePlay()          // Pause animation
setViewBlock(idx)        // Jump to specific block

// Visualization
renderStackStage(r)      // Cinematic multi-block view
renderEmbedStep(r)       // Token embeddings
renderAttnStep(r)        // Attention mechanisms
renderOutputStep(r)      // Final contextual vectors

// Utilities
tweenNumber(el, target)  // Smooth numeric animation
drawMatrix(canvasId, matrix)  // Heatmap rendering
drawAttnHeatmap(id, weights)  // Attention pattern display
```

#### transformer.js

```javascript
class TransformerModel {
  forward(tokens, numBlocks = 1)     // Full forward pass through blocks
  forwardBlock(input, blockParams)   // Single block computation
  positionalEncoding(seqLen)         // Generate PE matrix
}

const M = {
  mul(A, B)              // Matrix multiply
  add(A, B)              // Element-wise add
  T(A)                   // Transpose
  rowSoftmax(A)          // Softmax per row
  relu(A)                // ReLU activation
  layerNorm(A)           // Layer normalization
  // ... and more matrix ops
}
```

---

## 💡 Usage Examples

### Example 1: Explore Attention Patterns

1. Load **"Classic sentence"** preset: `["the", "cat", "sat", "on", "the", "mat"]`
2. Go to **Step 3: Multi-Head Attention**
3. Click **Head 1 Heatmap** to see attention weights
4. Observe: "sat" attends heavily to "cat" (subject)
5. Observe: "mat" attends to "on" (spatial relationship)

### Example 2: See Context Propagation

1. Build a sequence: `["big", "cat"]`
2. Go to **Stacked Encoder View**
3. Set Blocks to **3**
4. Click **▶ Play Stack**
5. Watch **Focus token shift** increase as:
   - Block 1: "cat" learns it's preceded by "big"
   - Block 2: "big" learns to emphasize size-related features
   - Block 3: Both tokens shift further in embedding space

### Example 3: Compare Quantization Schemes

1. Scroll to **Efficiency & Adaptation → Quantization**
2. Keep Blocks at **INT8** (default)
3. Choose **W_Q** (query projection matrix)
4. Switch Scheme between **AbsMax** and **Zero-point**
5. Observe reconstruction error differences:
   - AbsMax: Simpler, larger uniform error
   - Zero-point: More complex, better for skewed distributions

---

## 🎓 Educational Value

### For Students

- **Demystify Black Boxes:** See exactly what each operation computes
- **Build Intuition:** Watch data flow, spot where context helps
- **Hands-On Learning:** Experiment with sequences, block counts, heads
- **Code It Yourself:** Inspect source to see math in action

### For Researchers

- **Verify Implementations:** Check transformer math is correct
- **Prototype Ideas:** Add new visualizations or techniques
- **Debug Models:** Understand failure modes by inspecting internals
- **Teach Others:** Use live demos in papers/presentations

### For Practitioners

- **Model Behavior:** Understand why attention heads specialize
- **Hyperparameter Effects:** See impact of layer count, head count
- **Efficiency Trades:** Visualize quantization/distillation accuracy-cost tradeoffs
- **Fine-Tuning Prep:** Learn LoRA mechanics before implementing

---

## 🔐 Privacy & Security

✅ **All computation happens in your browser**
- No network requests for model inference
- Sequences never sent to any server
- Safe to use with sensitive text (locally)
- Works offline after initial page load

⚠️ **One exception:** Web fonts load from googleapis.com (required for typography)

---

## 🌐 Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| **Chrome/Edge** | ✅ Full | All features supported |
| **Firefox** | ✅ Full | All features supported |
| **Safari** | ✅ Full | Requires iOS 12+ for canvas |
| **Mobile Safari** | ✅ Full | Touch-friendly controls |
| **Mobile Chrome** | ✅ Full | Optimized for 375-425px |

### Tested Viewports

| Device | Resolution | Status |
|--------|-----------|--------|
| Desktop | 1440px | ✅ Full UI, all visualizations |
| Laptop | 1024px | ✅ Responsive grid layout |
| Tablet | 768px | ✅ Single-column step cards |
| Mobile | 425px | ✅ Horizontal scroll for matrices |
| Mobile | 375px | ✅ Minimal, readable layout |

---

## 🚀 Advanced Configuration

### Customization

All model hyperparameters are defined in `transformer.js`:

```javascript
const CONFIG = {
  D_MODEL: 8,           // Change model width
  N_HEADS: 2,           // Change attention head count
  D_HEAD: 4,            // Inferred: D_MODEL / N_HEADS
  D_FF: 16,             // Change FFN expansion factor
  MAX_BLOCKS: 4,        // Max stacked blocks (1-8 possible)
  VOCAB: [              // Change vocabulary
    'the', 'a', 'cat', 'dog', ...
  ],
};
```

### Adding New Techniques

1. Create function in `techniques.js`:
   ```javascript
   function renderMyTechnique() {
     // Your visualization here
   }
   ```
2. Add panel in `index.html`:
   ```html
   <div id="tech-mytech" class="tech-panel">
     <div id="mytechnique-viz"></div>
   </div>
   ```
3. Wire controls in `techniques.js`:
   ```javascript
   document.getElementById('tech-select').addEventListener('change', e => {
     if (e.target.value === 'mytech') renderMyTechnique();
   });
   ```

---

## 📝 Recent Changes

### Latest Patch (v2.1.0)

See [PATCH_SUMMARY.md](./PATCH_SUMMARY.md) for detailed changelog.

**Highlights:**
- ✨ Multi-block cinematic animation (1-4 blocks)
- 🎬 Play/pause/scrub controls for block flow
- 🎯 Smooth numeric tweening with cubic-out easing
- 🔧 Fixed rendering on mobile (<375px viewports)
- 📈 Block count slider for exploring layer stacking effects

---

## 🤝 Contributing

Contributions welcome! Here's how to help:

### Setting Up Development

```bash
git clone https://github.com/Subhagatoadak/LearnerPro.git
cd LearnerPro

# Open in any local server (GitHub Pages auto-deploys from main)
python -m http.server 8000
# Then visit http://localhost:8000
```

### Areas for Contribution

- **Visualizations:** Add new chart types or heatmaps
- **Techniques:** Implement more advanced transformer concepts
- **Accessibility:** Improve keyboard navigation, screen readers
- **Documentation:** Clarify explanations, add more examples
- **Performance:** Optimize canvas rendering, reduce bundle size
- **Features:** New presets, vocabulary, model configurations

### Pull Request Process

1. Fork the repository
2. Create feature branch: `git checkout -b feature/your-feature`
3. Make changes with clear commit messages
4. Ensure responsive design (test 375px, 1024px, 1440px)
5. Submit PR with description of changes
6. Maintainers review and merge

---

## 📚 References

### Transformer Papers

- **Original Transformer** (2017): [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- **BERT** (2018): [Pre-training Deep Bidirectional Transformers](https://arxiv.org/abs/1810.04805)
- **GPT** (2018): [Language Models are Unsupervised Multitask Learners](https://d4mucfpksywv.cloudfront.net/better-language-models/language-models.pdf)

### Implementation References

- **Attention Mechanism:** Scaled Dot-Product Attention (section 3.2.1 of original paper)
- **Positional Encoding:** Sinusoidal embeddings (section 3.5)
- **Layer Norm:** Post-normalization (Xiong et al., 2020)
- **Feed-Forward:** 2-layer MLP with ReLU (section 3.3)

### Interactive Learning

- [3Blue1Brown: Attention & Transformers](https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R4_67cd8OPt_dQ7B6U3)
- [Stanford CS224N: NLP with Deep Learning](https://web.stanford.edu/class/cs224n/)
- [Hugging Face Course](https://huggingface.co/course)

---

## 📄 License

MIT License — See LICENSE file for details.

Free to use, modify, and distribute with attribution.

---

## 👨‍💻 Author

**Subhagato Adak**
- GitHub: [@Subhagatoadak](https://github.com/Subhagatoadak)
- LearnerPro: [https://subhagatoadak.github.io/LearnerPro](https://subhagatoadak.github.io/LearnerPro)

---

## 🙏 Acknowledgments

- **D3.js** for elegant data visualization
- **Transformer authors** for inventing this incredible architecture
- **Interactive learning enthusiasts** for inspiring this project
- **Contributors** who've helped improve this tool

---

## ❓ FAQ

### Q: Why only 8 dimensions?
**A:** Keeps math visible on screen. Real models use 768-12288 dims—same math, bigger scale.

### Q: Why not use a real pre-trained model?
**A:** Web browsers can't efficiently run >100M parameter models. This toy model teaches the concepts without performance pain.

### Q: Can I modify the vocabulary?
**A:** Yes! Edit `CONFIG.VOCAB` in `transformer.js`. You'll get random embeddings for new words.

### Q: How does KV caching speed things up?
**A:** During generation, each new token only needs its own Q. Past K,V are cached—reusing them saves 2× memory/compute for long sequences.

### Q: What's the difference between LoRA and fine-tuning?
**A:** Fine-tuning updates all weights (slow, memory-heavy). LoRA adds small rank-r updates (fast, 1-2% params), sufficient for many tasks.

### Q: Is this production-ready?
**A:** No—it's educational! Real transformers use optimized libraries (PyTorch, JAX, TensorFlow), mixed precision, and GPU acceleration.

### Q: How do I deploy this on my own site?
**A:** Fork the repo, enable GitHub Pages in settings, or copy files to any static host. No backend needed.

---

## 📞 Support

- **Issues & Bugs:** [GitHub Issues](https://github.com/Subhagatoadak/LearnerPro/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Subhagatoadak/LearnerPro/discussions)
- **Questions:** Open an issue with the `question` label

---

## 🌟 Show Your Support

If LearnerPro helped you understand transformers better, please:
- ⭐ Star the repo
- 📢 Share with friends/colleagues
- 💬 Leave feedback via issues/discussions
- 🔗 Link to it in your blog/paper

---

**Last Updated:** April 2026  
**Version:** 2.1.0  
**Status:** Active Development

Made with ❤️ for transformer enthusiasts everywhere.
