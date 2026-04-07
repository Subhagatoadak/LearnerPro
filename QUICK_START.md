# LearnerPro Quick Start Guide

Get up to speed with LearnerPro in 5 minutes.

---

## 🚀 30-Second Intro

1. **Go to:** https://subhagatoadak.github.io/LearnerPro
2. **Click:** "Build A Sequence"
3. **Pick words:** Select tokens from the palette
4. **Watch:** Real-time transformer visualization
5. **Explore:** Click any section to inspect details

---

## 📋 Common Tasks

### Task 1: See How Attention Works

**Goal:** Understand which words pay attention to which other words.

**Steps:**
1. Load preset: **"Classic sentence"**
2. Scroll to **Step 3: Multi-Head Attention**
3. Look at **Head 1 Heatmap** (grid showing attention weights)
4. **Why this matters:** Shows what each word "looks at" to understand context

**Quick insight:** "sat" attends to "cat" → understanding the subject  
"on" attends to "the" → spatial relationships

---

### Task 2: Watch Context Propagate Through Blocks

**Goal:** See how data transforms as it passes through stacked blocks.

**Steps:**
1. Build sequence: `["big", "cat", "sat"]`
2. Find **Stacked Encoder View**
3. Set **Blocks slider** to **2**
4. Click **▶ Play Stack** (top right)
5. Watch colored chips flow through input → block 1 → block 2 → output

**Quick insight:** Focus token shift increases → context spreading  
"big" learns to emphasize color/size info as it flows through blocks

---

### Task 3: Inspect a Single Attention Head

**Goal:** Debug: Why doesn't my token attend to expected neighbors?

**Steps:**
1. Build sequence: `["the", "quick", "brown", "fox"]`
2. Go to **Step 3: Multi-Head Attention**
3. Click **Head 2** button (top left)
4. Set **Focus Query Token** to "brown"
5. Set **Compare Against Key** to "quick"
6. Look at **Focus Attention Flow** (animated arcs)
7. Hover over the key nodes to see exact weights

**Quick insight:** See exact percentages (e.g., 0.45 = 45% attention)

---

### Task 4: See Multi-Block Effects

**Goal:** Understand how stacking layers changes token representations.

**Steps:**
1. Build: `["good", "idea"]`
2. **Stack Stage → Blocks slider: 1**
3. Note the starting **Focus token shift: X.XXX**
4. **Blocks slider: 3**
5. Note new **Focus token shift: much larger!**
6. **Blocks slider: 4**
7. Watch shift increase further

**Quick insight:** More blocks = more context refinement  
Each layer refines embeddings based on sequence relationships

---

### Task 5: Learn About Quantization

**Goal:** See the speed-accuracy tradeoff in model compression.

**Steps:**
1. Scroll to **Efficiency & Adaptation → Quantization**
2. **Bit-width:** Keep at **INT8** (default)
3. **Target matrix:** Click **W_O** (output projection)
4. Watch canvas show:
   - Original weights (FP32)
   - Quantized integers
   - Reconstruction error (how wrong we are)
5. Change to **INT4** and see error increase

**Quick insight:** Fewer bits = smaller model + faster inference  
But more rounding error in computation

---

### Task 6: Understand LoRA Fine-Tuning

**Goal:** See how efficient fine-tuning updates work.

**Steps:**
1. Scroll to **Efficiency & Adaptation → LoRA**
2. Set **Rank r** to **2** (start small)
3. Look at:
   - **W₀** (frozen original weights)
   - **A matrix** (d × r = 8 × 2, small!)
   - **B matrix** (r × d = 2 × 8, small!)
   - **ΔW = B·A** (the update)
   - **W' = W₀ + α·ΔW** (final result)
4. Change **Rank r** to **4** → see matrices grow
5. Change **α** slider to see scaling effect

**Quick insight:** Instead of 8×8=64 parameters, use 8×2 + 2×8 = 32  
That's 50% parameter reduction for fine-tuning!

---

## 🎯 Navigation Shortcuts

| Want To | Click | Then |
|---------|-------|------|
| Build a sequence | "Build A Sequence" | Pick words |
| Auto-tour all steps | "Play Tour" button | Sit back & watch |
| Jump to a step | Click step dot (●) | Or scroll |
| Inspect a layer | Click block card | See metrics |
| Play block animation | "Play Stack" button | Watch chips move |
| Scrub to block | Drag timeline slider | Select block |
| See raw math | Open browser DevTools | Inspect variables |

---

## 📚 Cheat Sheet: Terms

| Term | Meaning | Where It Is |
|------|---------|------------|
| **Token** | Single word or sub-word unit | Input sequence |
| **Embedding** | Numeric vector (8-dim here) | Step 1 |
| **Attention** | Which words look at which words | Step 3 |
| **Head** | Independent attention mechanism | Step 3 (Head 1, Head 2) |
| **Block** | Attention + FFN + residuals | Stacked Encoder View |
| **FFN** | Small neural net per token | Step 5 |
| **Residual** | Skip connection (x + f(x)) | Between steps |
| **LayerNorm** | Stabilize vector magnitudes | After blocks |
| **Output** | Final context-aware vectors | Step 6 |

---

## 🔍 Understanding the Colors

### Heatmap Colors

- **Dark Blue** (`#0E3463`) → Very negative values
- **White** (center) → Values near zero
- **Orange** (`#FF5A1E`) → Very positive values

**How to read:** More blue = word pair disagrees, more orange = they agree

### Token Chips

Each token gets a **unique hue** that stays the same across blocks.
- Token 0: Cyan-ish
- Token 1: Blue-green
- Token 2: Teal-ish
- etc.

**Why:** Easy to track "this is the same token" as it flows through the network

---

## ⚡ Pro Tips

### Tip 1: Adjust Speed
The **Speed** slider (0.5x to 3x) controls tour playback.
- **0.5x** = Slow, study each step
- **3x** = Quick review

### Tip 2: Use Presets
Don't type! Load presets:
- **"Classic sentence"** → Simple grammar
- **"Adjective pair"** → See descriptors interact
- **"Action sequence"** → Watch verb relationships

### Tip 3: Compare Two Blocks
- Set Blocks to **2**
- Click prev/next buttons to jump between Block 1 and Block 2
- Notice: Block 2 has MORE refined attention patterns

### Tip 4: Maximize Your Screen
- Hide browser tabs/sidebars
- Use fullscreen (F11 or Cmd+Ctrl+F)
- Better visibility of heatmaps

### Tip 5: Inspect Values
Hover over any:
- Heatmap cell → Exact value in tooltip
- Attention arc → Percentage weight in tooltip
- Bar chart → Dimension name + value

---

## ❓ Quick Answers

**Q: What does "Focus Token Shift" mean?**  
A: How much the selected token's embedding changed. Larger = more context effect.

**Q: Why are some attention weights 0.00?**  
A: Softmax turned them off → that token doesn't attend to that word.

**Q: Can I see the raw numbers?**  
A: Yes! Open DevTools (F12) → Console → type `lastResult` → explore.

**Q: What if I want to add more tokens?**  
A: Max 6 tokens (for readability). Remove one first.

**Q: Does this work offline?**  
A: Yes! After loading once, it's in your browser cache.

**Q: Can I run my own weights?**  
A: Sort of—edit `CONFIG.VOCAB` in transformer.js, refresh. Gets random embeddings.

---

## 🎓 Learning Path

**Beginner (5 min):**
1. Load "Classic sentence"
2. Click ▶ Play Tour
3. Observe token flow

**Intermediate (15 min):**
1. Build your own sequence
2. Explore each step (1-6) in detail
3. Inspect attention heads
4. Compare 1 block vs 2 blocks

**Advanced (30 min):**
1. Study the math formulas (in README)
2. Explore all 4 techniques
3. Read source code (transformer.js, main.js)
4. Experiment with CONFIG settings

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| Blank page | Refresh (Cmd+R), check console (F12) |
| Slow animation | Lower Speed slider, try different browser |
| Can't see matrices | Make window wider, or scroll horizontally |
| Text too small | Zoom in (Cmd/Ctrl +) |
| Buttons not responding | Check for overlapping elements, scroll to see full UI |

---

## 📞 Need Help?

- **GitHub Issues:** [Report bugs here](https://github.com/Subhagatoadak/LearnerPro/issues)
- **Discussions:** [Ask questions here](https://github.com/Subhagatoadak/LearnerPro/discussions)
- **README:** [Full documentation](./README.md)
- **Source Code:** [Explore the math](./transformer.js)

---

## 🎉 Next Steps

✅ You now know how to:
- Build sequences and watch them transform
- Inspect attention patterns
- Understand multi-block stacking
- Explore advanced techniques
- Find the help you need

**Suggested next:** Pick one task above and try it now!

---

**Happy learning!** 🚀

Made with ❤️ for transformer enthusiasts.
