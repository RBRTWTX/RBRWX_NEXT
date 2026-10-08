import {useEffect,useRef,useState} from 'react';
export function EditableText({value,edit,label,className=''}:{value:string;edit?:(value:string)=>void;label:string;className?:string}){
 const ref=useRef<HTMLSpanElement>(null),[editing,setEditing]=useState(false),cancel=useRef(false);
 useEffect(()=>{if(editing&&ref.current){ref.current.textContent=value;ref.current.focus();const range=document.createRange();range.selectNodeContents(ref.current);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);}},[editing]);
 return <span ref={ref} className={`synoptic-text ${className}`} aria-label={label} role={editing?'textbox':undefined} contentEditable={editing} suppressContentEditableWarning spellCheck={false}
  tabIndex={edit?0:undefined} title={edit?'Double-click to edit; Enter saves; Escape cancels':undefined}
  onDoubleClick={e=>{if(!edit)return;e.stopPropagation();cancel.current=false;setEditing(true);}}
  onPointerDown={e=>{if(editing)e.stopPropagation();}}
  onKeyDown={e=>{e.stopPropagation();if(!editing&&(e.key==='Enter'||e.key==='F2')&&edit){e.preventDefault();cancel.current=false;setEditing(true);}else if(editing&&e.key==='Escape'){cancel.current=true;e.currentTarget.textContent=value;e.currentTarget.blur();}else if(editing&&e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}
  onBlur={e=>{if(editing&&!cancel.current)edit?.((e.currentTarget.textContent??'').replace(/[\r\n]+/g,' '));setEditing(false);}}
  onPaste={e=>{e.preventDefault();const text=e.clipboardData.getData('text/plain').replace(/[\r\n]+/g,' '),selection=window.getSelection();if(selection?.rangeCount){const range=selection.getRangeAt(0);range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);}}}
 >{editing?undefined:value}</span>;
}
