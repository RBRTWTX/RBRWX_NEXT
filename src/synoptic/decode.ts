import { decodeFieldValues, type GribField } from '@azohra/meteo.grib';
import { decodeJ2k } from '@azohra/meteo.j2k';
import { decode as decodePng } from 'fast-png';
/** GRIB 5.41 stores unsigned samples in a lossless PNG, not display colors. */
export function decodeGrid(f:GribField):Float64Array {
 const v=new DataView(f.section5.buffer,f.section5.byteOffset,f.section5.byteLength);
 if(v.getUint16(9)!==41)return decodeFieldValues(f,{decodeJ2k,missingValue:NaN}).values;
 const signed=(off:number)=>{const n=v.getUint16(off);return (n&0x8000)?-(n&0x7fff):n;};
 const count=v.getUint32(5),reference=v.getFloat32(11),binary=2**signed(15),decimal=10**(-signed(17));
 if(f.section6&&f.section6[5]!==255)throw Error('PNG GRIB bitmap not supported; refusing incomplete data');
 if(v.getUint8(19)===0)return new Float64Array(count).fill(reference*decimal);
 const png=decodePng(f.section7.subarray(5));if(png.channels!==1||png.data.length!==count)throw Error('PNG GRIB dimensions/channels differ from numeric sample count');
 return Float64Array.from(png.data,s=>(reference+s*binary)*decimal);
}
