import os

sections = {
    'section1': '''# Section 1: Historical Context and Fundamental Principles of X-ray Phase Imaging

## Overview
This section focuses on the transition from traditional absorption-based X-ray imaging to phase-contrast imaging (PCI). It establishes the physical and mathematical foundations required to understand why phase measurement is superior for low-Z materials.

## Research Topics
1. **Evolution of X-ray Imaging**: From Roentgen to modern synchrotron-based PCI. Comparison of absorption vs. phase sensitivity in the hard X-ray regime.
2. **Interaction of X-rays with Matter**: Detailed derivation of the complex refractive index $n = 1 - \\delta + i\\beta$. Relationship between $\\delta$ and the electron density.
3. **Coherence Theory**: Spatial and temporal coherence requirements for phase-sensitive measurements. The role of the Van Cittert-Zernike theorem.
4. **Classic PCI Modalities**:
   - Crystal Interferometry (Bonse-Hart).
   - Propagation-Based Imaging (PBI) and the Fresnel diffraction regime.
   - Analyzer-Based Imaging (ABI) and refraction-angle sensitivity.

## Key Goals
- Synthesize the mathematical proof that $\\delta \\gg \\beta$ for light elements.
- Map the coherence requirements for each classical modality.
- Identify the limitations of classical methods that led to the development of speckle-based techniques.
''',
    'section2': '''# Section 2: Grating and Speckle-based X-ray Phase Contrast Techniques

## Overview
This section explores the development of modulator-based phase imaging, focusing on gratings and the transition to random diffusers (speckle-based imaging).

## Research Topics
1. **Grating Interferometry**: Talbot and Talbot-Lau effects. The use of phase and analyzer gratings. Phase stepping and Moire fringe analysis.
2. **Introduction to Speckle-Based Imaging (SBI)**: The physics of random modulators (e.g., sandpaper, membranes). Near-field vs. far-field speckle regimes.
3. **Traditional SBI Algorithms**:
   - Speckle Tracking (ST) and sub-pixel cross-correlation.
   - Unified Modulated Pattern Analysis (UMPA).
   - Transport of Intensity Equation (TIE)-based SBI.
4. **The Concept of "Dark-field" Contrast**: Small-angle X-ray scattering (SAXS) encoded in speckle visibility degradation.

## Key Goals
- Compare the technical complexity and aspect-ratio requirements of gratings vs. random diffusers.
- Evaluate the trade-offs between spatial resolution and sensitivity in traditional SBI.
- Document the "LCS" (Low Coherence System) method as a benchmark for single-shot comparisons.
''',
    'section3': '''# Section 3: Mathematical Foundations and Advanced Phase Retrieval Algorithms

## Overview
Building on the 2026pwf.pdf paper, this section dives into the rigorous mathematical treatment of phase retrieval as an optimization problem. It focuses on the transition from assumption-based tracking to assumption-free field reconstruction.

## Research Topics
1. **Inverse Problems in Phase Retrieval**: The non-linear mapping from complex fields to intensity measurements. Phase wrapping and uniqueness issues.
2. **Wirtinger Flow (WF)**: The concept of Wirtinger derivatives for optimizing non-holomorphic complex functions. Convergence properties and global minimum search.
3. **Preconditioned Wirtinger Flow (PWF)**:
   - Derivation of the inverse quadratic preconditioning filter.
   - Solving the ill-conditioned nature of phase gradient sensing.
   - Nesterov’s accelerated gradient method for phase problems.
4. **Physics-Informed Modeling**: Incorporating the Intensity Point Spread Function (IPSF) and Intensity Optical Transfer Function (IOTF) to account for partial coherence.

## Key Goals
- Provide a step-by-step derivation of the PWF forward model as described in the primary 2026 paper.
- Analyze the oversampling ratio ($M/N$) requirement for unique field determination.
- Compare WF-based approaches with traditional iterative phase retrieval (e.g., Gerchberg-Saxton, HIO).
''',
    'section4': '''# Section 4: 3D Microtomography and Quantitative Phase Reconstruction

## Overview
This section focuses on the extension of 2D phase retrieval to 3D volumetric data, emphasizing the quantitative accuracy of the reconstructed refractive index distribution.

## Research Topics
1. **Tomographic Principles**: Radon transform and Filtered Back Projection (FBP). Adaptation for phase-contrast data (Integrating gradients vs. reconstructing $\\delta$).
2. **Quantitative 3D Interpretation**: Mapping reconstructed values to physical properties like mass density and electron density.
3. **Evaluation and Metrics**:
   - Fourier Shell Correlation (FSC) for 3D resolution estimation.
   - The "1/4 criterion" vs. standard criteria for non-linear algorithms.
   - RMSE (Root Mean Square Error) analysis for model validation.
4. **Noise and Artifacts**: Phase-coupling artifacts, ring artifacts, and the effect of angular sampling (Crowther criterion).

## Key Goals
- Explain the method for decoupling attenuation ($\\beta$) and phase ($\\delta$) in a 3D volume.
- Contrast the 3D results of PWF with traditional speckle tracking (as shown in Fig. 3 of the primary paper).
- Define the limits of spatial resolution in a projection-based 3D system.
''',
    'section5': '''# Section 5: Practical Applications, Bench-top Implementation, and Future Outlook

## Overview
The final section surveys the practical utility of modern phase measurement and looks toward future technological shifts, particularly for laboratory-scale deployment.

## Research Topics
1. **Synchrotron vs. Bench-top Sources**: Adapting PWF for wiggler sources (synchrotron) vs. liquid metal jet or micro-focus tubes (laboratory).
2. **Multidisciplinary Applications**:
   - Biological Imaging: Soft tissue contrast in organisms (shrimp, anchovy, cumin seed).
   - Materials Science: Composite inspection and micro-porosity.
   - Medical: Potential for clinical mammography and low-dose imaging.
3. **AI and Machine Learning Integration**: Using deep learning for real-time phase retrieval and denoising.
4. **Future Directions**: Polychromatic source adaptation, spectral phase-contrast imaging, and high-speed dynamic (time-resolved) PCI.

## Key Goals
- Summarize the versatility of PWF across various sample types (as demonstrated in Fig. 4).
- Identify the remaining hurdles for clinical translation (dose, speed, FOV).
- Propose a research roadmap for polychromatic SBI.
'''
}

base_path = r'C:\Users\mw\Desktop\xray-literature'
for folder, content in sections.items():
    folder_path = os.path.join(base_path, folder)
    if not os.path.exists(folder_path):
        os.makedirs(folder_path)
    file_path = os.path.join(folder_path, 'plan.md')
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'Created {file_path}')
