import type {ReactNode} from 'react';
import {useBroadcast} from '../broadcast';
import {CurrentWeatherProvider} from '../current-weather/CurrentWeather';
import type {Product} from '../current-weather/model';
export {WeatherControls,WeatherPlayback,WeatherStatus,WeatherMapConnection} from '../current-weather/CurrentWeather';
export function productForContent(contentKey:string|undefined):Product { return contentKey==='current.observations'?'observations':contentKey==='current.radar'?'radar':contentKey==='current.satellite'?'satellite':'map'; }
export function CurrentWeatherHost({children}:{children:ReactNode}){const{programScene,state}=useBroadcast();return <CurrentWeatherProvider sceneId={state.programItemId??'startup'} product={productForContent(programScene?.contentKey)}>{children}</CurrentWeatherProvider>;}
export function CurrentProductSelector(){const{programScene,takeScene}=useBroadcast();const active=productForContent(programScene?.contentKey);return <div className="wx-product-selector" aria-label="Exclusive weather product">{([['map','MAP','base-broadcast-map'],['observations','CURRENT','current-observations'],['satellite','SATELLITE','current-satellite'],['radar','RADAR','current-radar']] as const).map(([product,label,id])=><button type="button" key={id} aria-pressed={active===product} onClick={()=>takeScene(id)}>{label}</button>)}</div>;}

export function CurrentSceneHeading({satellite}:{satellite:boolean}){const{programScene}=useBroadcast();const current=programScene?.contentKey.startsWith('current.');return <><strong>{current?programScene?.title:satellite?'Satellite Basemap':'Broadcast Map Foundation'}</strong><span>{current?programScene?.subtitle:satellite?'Reference imagery basemap':'South-Central Texas'}</span></>;}
