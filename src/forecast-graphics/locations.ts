export interface ForecastLocation {name:string;lat:number;lon:number}
export const FORECAST_LOCATIONS:ForecastLocation[]=[
 {name:'Redbird Ranch',lat:29.4317,lon:-98.8063},
 {name:'San Antonio',lat:29.4241,lon:-98.4936},
 {name:'Castroville',lat:29.3558,lon:-98.8786},
 {name:'Rio Medina',lat:29.4961,lon:-98.8839},
 {name:'Helotes',lat:29.578,lon:-98.6897},
 {name:'Hondo',lat:29.3475,lon:-99.1414},
];
export function validLocation(value:ForecastLocation){return typeof value?.name==='string'&&value.name.length>0&&value.name.length<=80&&Number.isFinite(value.lat)&&value.lat>=-90&&value.lat<=90&&Number.isFinite(value.lon)&&value.lon>=-180&&value.lon<=180;}
