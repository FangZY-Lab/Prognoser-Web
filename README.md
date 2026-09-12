# Prognoser-Web

**Prognoser-Web is a browser-based colorectal cancer molecular annotation tool.** It takes one gene expression matrix as input and returns CRC risk classification, microsatellite status, and modular molecular visualizations. All computations run locally in the browser; no expression data is uploaded.

## Live tool

**Access the tool here:**

<https://fangzy-lab.github.io/Prognoser-Web/>

Source repository:

<https://github.com/FangZY-Lab/Prognoser-Web>

## Core workflow

1. Upload a gene expression matrix.
2. Open **Risk classification** to obtain `iHRS` / `iLRS` labels from ssGSEA features and a bundled random forest model.
3. Open **Microsatellite status** to obtain `MSI-H` / `MSI-L` labels from the PreMSIm-style kNN classifier.
4. Run any additional module independently to visualize molecular features.

## Available modules

| Module | Description |
| --- | --- |
| Risk classification | ssGSEA + random forest prediction of iHRS / iLRS |
| Microsatellite status | PreMSIm-style kNN prediction of MSI-H / MSI-L |
| Risk score distribution | Distribution of the iHRS probability |
| Differential expression | Volcano plot comparing iHRS and iLRS samples |
| iCMS subtype | ssGSEA scores for iCMS2 / iCMS3 signatures |
| CMS classification | Nearest-template CMS1 / CMS2 / CMS3 / CMS4 prediction |
| Hallmark pathways | Hallmark gene-set activity heatmap |
| Functional signatures | CMS-derived functional gene-set activity heatmap |
| Immune cell infiltration | 28 immune cell signature ssGSEA heatmap |
| Immunomodulators | Z-scored expression heatmap of immunomodulatory genes |
| ESTIMATE algorithm | Immune, stromal, ESTIMATE, and tumor purity scores |
| Immunophenoscore | MHC, checkpoint, effector, suppressor, and IPS scores |
| xCell CAF | Cancer-associated fibroblast signature ssGSEA heatmap |
| MCPcounter | MCPcounter cell abundance ssGSEA heatmap |
| TME classification | Nearest-centroid TMEA / TMEB / TMEC prediction |

The following modules are displayed for pipeline completeness. They are part of the original reference code and require additional pre-trained model files that are not bundled in this browser build:

| Module | Description |
| --- | --- |
| T cell states | TCellSI T-cell state scores |
| Metabolic flux | Metabolic flux differential analysis |
| Pseudotime trajectory | slingshot trajectory inference |

## Input format

- Rows are genes; columns are samples.
- Supported extensions: `.txt`, `.tsv`, `.csv`.
- Delimiters are detected automatically.
- Gene identifiers should be human gene symbols. Duplicate symbols are averaged.

## Method notes

- Risk features are generated with GSVA ssGSEA and standardized across samples before random forest prediction.
- MSI status is generated with a 5-nearest-neighbor classifier over the 15-gene PreMSIm panel.
- Heatmaps show sample-level standardized ssGSEA scores.

## Run locally

```bash
open index.html
```

Or serve the directory:

```bash
python3 -m http.server 4173
```

## Deployment

GitHub Pages is configured through the included workflow. Any push to `main` triggers a fresh deployment.

## License

MIT. See [LICENSE](LICENSE).
