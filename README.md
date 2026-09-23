# PlotTwist

PlotTwist is a diagnostic benchmark for studying deception-aware reasoning in
vision-language models.

## Abstract

Large vision-language models (LVLMs) have achieved remarkable progress in
visual understanding, yet their ability to reason reliably in the presence of
misleading visual information remains largely unexplored. Existing benchmarks
mainly evaluate recognition and question answering in settings where relevant
visual evidence is explicit and does not intentionally conflict with distracting
cues. However, real-world visual interpretation can involve misleading signals
and deceptive patterns that provide compelling but unreliable evidence, making
it important to understand whether multimodal models can identify trustworthy
evidence and resist deceptive interpretations.

Unlike conventional spurious-correlation settings, where models exploit
unreliable statistical associations, the misleading clues considered here are
semantically relevant and locally plausible. The challenge is therefore to
arbitrate among competing pieces of evidence and prioritize the most diagnostic
visual cues.

We introduce PlotTwist, a diagnostic benchmark for evaluating deception-aware
reasoning in visual riddles. PlotTwist focuses on scenarios in which models must
distinguish diagnostic evidence from deceptive clues, prioritize informative
visual cues, and infer the intended answer beyond superficially plausible
interpretations. To obtain sufficiently diverse and creative examples, PlotTwist
combines visual riddles curated from online sources with newly developed riddles
created through human-designed scenarios with the aid of generative models,
which also support image generation. This process enables the construction of
diverse visual riddles exhibiting different forms of misleading evidence and
deception.

PlotTwist contains visual riddles accompanied by structured annotations of
deceptive visual clues, diagnostic evidence, intended answers, and solution
rationales. We evaluate state-of-the-art proprietary and open-weight LVLMs by
first measuring their ability to solve the riddles. We then use manually
annotated regions to construct visual hints that selectively emphasize either
deceptive clues or diagnostic evidence. By comparing model responses before and
after these interventions, we examine how strongly models persist in their
initial interpretations, whether emphasizing deceptive evidence can induce
incorrect answers, and whether highlighting diagnostic evidence can recover
initially incorrect predictions.

Our experiments show that current LVLMs are frequently misled by plausible
deceptive cues and often fail to identify or sufficiently prioritize the
evidence required for the intended solution.

PlotTwist provides a systematic framework for studying how vision-language
models reason under misleading visual evidence and offers a challenging
benchmark for developing more robust, evidence-grounded, and deception-
resistant multimodal systems.

## Repository organization

- [`dataset-studio/`](dataset-studio/) — annotation, response review, and
  export tooling. See its [README](dataset-studio/README.md) for setup and
  development instructions.
- [`benchmarks/`](benchmarks/) — benchmark definitions and reproducible
  evaluation work.
- [`analysis/`](analysis/) — downstream analysis, notebooks, figures, tables,
  and research notes.

Shared package and Docker entrypoints remain at the repository root so the
three sections can be developed independently without duplicating tooling.
