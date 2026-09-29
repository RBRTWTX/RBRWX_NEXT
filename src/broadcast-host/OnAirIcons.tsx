import type {ButtonHTMLAttributes} from 'react';
const paths:Record<string,string>={
 surge:'M2 10q3-5 6 0t6 0 6 0 M2 17q3-5 6 0t6 0 6 0 M12 2v5',title:'M3 5h18v14H3z M7 9h10 M12 9v7',add:'M3 5h12v14H3z M7 9h4 M9 9v6 M19 9v8 M15 13h8',
 refresh:'M20 8a8 8 0 1 0 0 8 M20 3v5h-5',alerts:'M3 6h18v12H3z M6 10h12 M6 14h8',warning:'M12 3 2 21h20z M12 9v5 M12 17v1',
 lightning:'M13 2 5 14h6l-1 8 9-13h-7z',cone:'M5 20 8 6q4-6 8 0l3 14 M5 20q7-5 14 0 M12 7v2 M12 12v2 M12 17v2',
 radar:'M12 12 18 5 M20 7a9 9 0 1 1-5-4 M16 10a5 5 0 1 1-5-3 M11 12h2',sweep:'M12 12V3a9 9 0 1 1-9 9z M12 12l7 5',
 satellite:'M7 4a12 12 0 0 0 13 13 M7 4l13 13 M9 15l-4 6h12 M13 10l5-5 M17 3h4v4',pen:'m4 16 12-12 4 4L8 20H4z M13 7l4 4',
 track:'M3 20 20 3 M12 3h8v8 M6 11v6h6',off:'M6 3v6 M18 3v6 M3 9h18v12H3z M4 4l16 16',
 undo:'M9 4 3 10l6 6 M3 10h11a6 6 0 0 1 6 6',clear:'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
 previous:'M5 4v16 M19 4 7 12l12 8z',next:'M19 4v16 M5 4l12 8-12 8z',play:'M6 3l15 9-15 9z',pause:'M7 4v16 M17 4v16',
 loop:'M4 8h15l-4-4 M20 16H5l4 4 M20 8v4 M4 16v-4',latest:'M5 5v14l10-7z M19 4v16',
 popout:'M14 3h7v7 M21 3 11 13 M10 5H3v16h16v-7',hide:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M3 3l18 18',
 info:'M12 10v7 M12 6v1 M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0',rundown:'M8 5h13 M8 12h13 M8 19h13 M3 5h1 M3 12h1 M3 19h1',take:'M3 5h18v14H3z M9 8l6 4-6 4z'
};
export function ToolIcon({name}:{name:string}){return <svg className="onair-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]??paths.info}/></svg>;}
export function IconButton({icon,label,short,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{icon:string;label:string;short?:string}){return <button type="button" {...props} className={`onair-icon-button ${props.className??''}`} title={label} aria-label={label}><ToolIcon name={icon}/>{short&&<span>{short}</span>}</button>;}
