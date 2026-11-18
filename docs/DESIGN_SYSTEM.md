# BioTwin workspace design

- The default dark shell uses #101922 and #18232D surfaces, #E9EFF2 text and #70D2CB teal data marks. Light mode uses #F6F6F2 chrome and #172129 text. The toggle persists the user's choice on this browser origin. The print report uses an independent light palette.
- The 3D chamber uses graphite #0E1720 with a restrained grid and a brighter centered field. The stage uses the same authentic physiological materials in both themes. A/B shares one renderer. A has teal identification and B muted blue. Amber identifies interventions and limitations.
- DM Sans, IBM Plex Mono and Instrument Serif are bundled locally. The serif is confined to the welcome title. IBM Plex Mono distinguishes values and time.
- At desktop widths the navigation, stage and bounded inspector occupy the first row, and the plot spans the work area below them. Tablet places navigation above the stage and inspector. Phone uses a single column with a horizontally scrollable plot and anatomy controls close to the canvas.
- The real 3D pick drives the selection marker. Reveal changes actual skin opacity and layer visibility. A/B switches the snapshot in the existing renderer. The time ruler links the active snapshot, biomarker readings and chart cursor.
- Controls use native form semantics, labels, visible focus and Escape-dismissable dialogs. Existing reduced-motion camera behavior is preserved. Full WCAG conformance and physical-device testing remain unverified.
