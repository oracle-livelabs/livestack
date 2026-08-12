import { useState } from 'react';
import { useInstitution } from '../context/InstitutionContext';

export default function InstitutionNameTool() {
 const { defaultInstitutionName, defaultShortInstitutionName, institutionName, setInstitutionName } = useInstitution();
 const [draftName, setDraftName] = useState(institutionName);
 const [saveForBrowser, setSaveForBrowser] = useState(false);

 return (
 <section className="institution-tool" aria-label="Institution name">
 <div className="institution-tool__header">
 <span className="oj-fwk-icon oj-fwk-icon-edit institution-tool__icon" aria-hidden="true" />
 <p className="institution-tool__label">Institution name</p>
 </div>
 <input
 className="institution-tool__input"
 value={draftName}
 aria-label="Institution name"
 onChange={(event) => setDraftName(event.target.value)}
 onKeyDown={(event) => {
 if (event.key === 'Enter') setInstitutionName(draftName, saveForBrowser);
 }}
 />
 <p className="institution-tool__map">
 {defaultInstitutionName} / {defaultShortInstitutionName}{' -> '}visible demo name
 </p>
 <label className="institution-tool__save">
 <input
 type="checkbox"
 checked={saveForBrowser}
 onChange={(event) => setSaveForBrowser(event.target.checked)}
 />
 <span>Save for this browser</span>
 </label>
 <button
 type="button"
 className="institution-tool__apply"
 onClick={() => setInstitutionName(draftName, saveForBrowser)}
 >
 Apply
 </button>
 </section>
 );
}
