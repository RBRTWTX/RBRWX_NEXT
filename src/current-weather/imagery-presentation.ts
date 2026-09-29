import type {Options,Product} from './model';
export function imageryPresentation(product:Product,options:Options,site='KEWX') {
 const field=options.radarField??'reflectivity',feed=options.satelliteFeed??'longwave';
 if(product==='radar'&&field!=='reflectivity'){
  const suffix=field==='velocity'?'sr_bvel':'bdhc',id=/^[A-Z0-9]{4}$/.test(site)?site.toLowerCase():'kewx';
  const title=field==='velocity'?'Radial Velocity':'Hydrometeor Classification';
  return {title,weatherKeyId:'none',legendTitle:`${site} · ${title} · NWS service key`,legendUrl:`https://opengeo.ncep.noaa.gov/geoserver/${id}/ows?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetLegendGraphic&FORMAT=image/png&LAYER=${id}_${suffix}`};
 }
 if(product==='satellite'&&feed!=='longwave')return {title:`GOES ${feed.replaceAll('_',' ')} Satellite`,weatherKeyId:'none',legendTitle:`GOES ${feed.replaceAll('_',' ')} · NOAA service key`,legendUrl:`https://nowcoast.noaa.gov/geoserver/satellite/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetLegendGraphic&FORMAT=image/png&LAYER=goes_${feed}_imagery`};
 return {};
}
