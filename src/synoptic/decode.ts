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
 const png=decodePng(f.section7.subarray(5)),bits=v.getUint8(19),channels=bits===24?3:bits===32?4:1;
 // WMO 7.41: RGB/RGBA bytes form one unsigned 24/32-bit number, not display color.
 if(png.channels!==channels||png.data.length!==count*channels||png.depth!==(channels===1?bits:8))throw Error('PNG GRIB dimensions/channels differ from numeric sample count');
 const values=new Float64Array(count);
 for(let i=0;i<count;i++){let sample=0;for(let c=0;c<channels;c++)sample=sample*(channels===1?1:256)+png.data[i*channels+c];values[i]=(reference+sample*binary)*decimal;}
 return values;
}
