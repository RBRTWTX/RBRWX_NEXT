import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {GraphicsProvider,GraphicsOverlay,useGraphics} from '../../src/broadcast-graphics/Graphics';
import {ForecastGraphicsProvider,ForecastGraphicEditorStage,useForecastGraphics} from '../../src/forecast-graphics/ForecastGraphics';
import {EwxProvider,LiveEwxScroll,useEwxAlerts} from '../../src/current-weather/EwxAlerts';
import '../../src/broadcast-graphics/graphics.css';
import '../../src/broadcast-graphics/barLibrary.css';
import '../../src/broadcast-host/broadcastHost.css';
function Bridge(){const graphics=useGraphics(),forecast=useForecastGraphics(),ewx=useEwxAlerts();(window as any).editors={graphics,forecast,ewx};return null;}
function App(){const [scene,setScene]=useState('a'),[type,setType]=useState('map');(window as any).setEditorScene=(id:string,t='map')=>{setScene(id);setType(t);};return <div className="rbrwx-broadcast-workspace"><div className="operator-canvas-stage"><GraphicsProvider scene={{id:scene,title:`Automatic ${scene}`}}><ForecastGraphicsProvider sceneId={scene} title="Forecast title" contentKey={type==='forecast'?'graphic.need-to-know':type.startsWith('graphic.')?type:null}><EwxProvider><Bridge/>{type!=='map'?<ForecastGraphicEditorStage/>:<GraphicsOverlay/>}<LiveEwxScroll/></EwxProvider></ForecastGraphicsProvider></GraphicsProvider></div></div>;}
createRoot(document.getElementById('root')!).render(<App/>);
