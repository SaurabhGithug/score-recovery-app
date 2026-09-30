import { getDatabase } from "../db";
import { SyllabusRepository } from "../repositories/syllabus-repo";

// A small, explicitly bounded reference library. Checked against OpenStax §12.3 on 2026-09-29.
// It is not represented as a complete Civil theory bank or as SSC-authored teaching material.
export async function seedLearningReferences() {
  const nodeId="SSC_JE:2026:chapter:solid-mechanics:topic:simple-stress-and-strain-relationships";
  if(!(await SyllabusRepository.getNode(nodeId)))return;
  const sourceTitle="OpenStax · University Physics Volume 1 · §12.3";
  const sourceLocator="https://openstax.org/books/university-physics-volume-1/pages/12-3-stress-strain-and-elastic-modulus";
  const sourceEdition="University Physics Volume 1, online §12.3; checked 2026-09-29";
  const noteId="learn-ref:stress-strain:source:v1";
  if(!(await getDatabase().prepare("SELECT id FROM theory_notes WHERE id=?").get(noteId))) {
    await SyllabusRepository.addTheoryNote({id:noteId,nodeId,kind:"source_extract",layer:"concise",body:"Therefore, strain is a dimensionless number.",derivedFrom:[],diagrams:[],sourceTitle,sourceLocator,sourceEdition,verificationStatus:"verified"});
    await SyllabusRepository.addTheoryNote({id:"learn-ref:stress-strain:teaching:v1",nodeId,kind:"teaching_note",layer:"concise",body:"Normal stress measures perpendicular force per cross-sectional area. Axial strain compares length change with original length. Young’s modulus relates the two within the linear elastic range. Stress and modulus have pressure units; strain is dimensionless. Identify the loading and applicable range before using the relationship.",derivedFrom:[noteId],diagrams:[],sourceTitle,sourceLocator,sourceEdition,verificationStatus:"unverified"});
  }
  const formulas=[
    {id:"learn-formula:normal-stress:v1",name:"Average axial normal stress",expression:"σ = F⊥ / A",latex:"\\sigma = \\frac{F_\\perp}{A}",symbols:[{symbol:"σ",meaning:"normal stress",unit:"Pa = N/m²",dimension:"M L⁻¹ T⁻²"},{symbol:"F⊥",meaning:"force normal to the cross-section",unit:"N",dimension:"M L T⁻²"},{symbol:"A",meaning:"cross-sectional area",unit:"m²",dimension:"L²"}],assumptions:["Axial loading normal to the cross-section; uniform stress interpretation requires uniform stress."],applicability:"Axial tension or compression; magnitude convention.",exclusions:["Not a local bending or shear stress distribution."],conventions:"Magnitude in compression; σ is our notation for the source's tensile stress.",dimensionalNotes:"Force divided by area gives pressure.",locator:"Equations 12.34–12.35"},
    {id:"learn-formula:axial-strain:v1",name:"Axial engineering strain",expression:"ε = ΔL / L₀",latex:"\\varepsilon = \\frac{\\Delta L}{L_0}",symbols:[{symbol:"ε",meaning:"axial strain",unit:"1 (dimensionless)",dimension:"1"},{symbol:"ΔL",meaning:"length change",unit:"m",dimension:"L"},{symbol:"L₀",meaning:"original length",unit:"m",dimension:"L"}],assumptions:["Both lengths use the same units; original length is non-zero."],applicability:"Change in length relative to original length.",exclusions:["Not logarithmic/true strain."],conventions:"Use a consistent tension/compression sign or magnitude convention.",dimensionalNotes:"Length divided by length is dimensionless.",locator:"Equation 12.35"},
    {id:"learn-formula:young-modulus:v1",name:"Young’s modulus in the linear elastic range",expression:"E = σ / ε",latex:"E = \\frac{\\sigma}{\\varepsilon}",symbols:[{symbol:"E",meaning:"Young’s modulus (Y in the source)",unit:"Pa",dimension:"M L⁻¹ T⁻²"},{symbol:"σ",meaning:"axial normal stress",unit:"Pa",dimension:"M L⁻¹ T⁻²"},{symbol:"ε",meaning:"axial strain",unit:"1 (dimensionless)",dimension:"1"}],assumptions:["Uniaxial linear elastic response; non-zero strain for this ratio."],applicability:"Proportional stress–strain response.",exclusions:["Do not extend the constant-modulus relation beyond the linear range."],conventions:"E denotes the same modulus labelled Y by the source.",dimensionalNotes:"Dividing stress by dimensionless strain retains pressure units.",locator:"Equations 12.33 and 12.36"},
  ];
  for(const f of formulas)if(!(await SyllabusRepository.getFormula(f.id)))await SyllabusRepository.upsertFormula({...f,sourceTitle:`${sourceTitle} · ${f.locator}`,sourceLocator,sourceEdition,verificationStatus:"verified",links:[{relation:"uses_formula",direction:"in",otherType:"node",otherId:nodeId,evidence:"Editorial linkage to the printed simple stress/strain topic; equations checked against cited textbook."}]});
}
