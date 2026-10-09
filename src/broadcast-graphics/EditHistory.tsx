import type {HistoryAction} from './sceneDocuments';
export function EditHistory({act}:{act:(action:HistoryAction)=>void}) {
 return <span className="wx-edit-history">{(['undo','redo','save','restore','reset'] as const).map(action=><button type="button" key={action} title={{undo:'Undo last edit',redo:'Redo edit',save:'Save a restore point',restore:'Restore your saved point',reset:'Reset to scene defaults (undoable)'}[action]} onClick={()=>act(action)}>{action==='save'?'Save point':action[0].toUpperCase()+action.slice(1)}</button>)}</span>;
}
