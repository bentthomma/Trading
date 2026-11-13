/** Exact fixed-decimal arithmetic for planning; never converts money or units to Number. */
import {fail} from '../errors.mjs';

export const DECIMAL_PLACES=18;
export const DECIMAL_INTEGER_DIGITS=24;
const SCALE=10n**BigInt(DECIMAL_PLACES);
const MAX_SCALED=10n**BigInt(DECIMAL_INTEGER_DIGITS+DECIMAL_PLACES)-1n;
const syntax=/^-?(?:0|[1-9][0-9]{0,23})(?:\.[0-9]{0,17}[1-9])?$/;

/** Canonical: no exponent, leading/trailing zeros, plus sign or negative zero. */
export function validateDecimal(value,{positive=false,nonNegative=false}={}){
  if(typeof value!=='string'||!syntax.test(value)||value==='-0')
    fail('PLANNING_DECIMAL_INVALID','Eine kanonische Dezimalzeichenkette mit höchstens 24 Vor- und 18 Nachkommastellen wird benötigt.');
  if(positive&&(value==='0'||value.startsWith('-'))||nonNegative&&value.startsWith('-'))
    fail('PLANNING_DECIMAL_SIGN','Die Dezimalzahl hat ein unzulässiges Vorzeichen.');
  return value;
}

function scaled(value){
  validateDecimal(value);
  const negative=value.startsWith('-'),[whole,fraction='']=value.replace(/^-/,'').split('.');
  const magnitude=BigInt(whole+fraction.padEnd(DECIMAL_PLACES,'0'));
  return negative?-magnitude:magnitude;
}

function fromScaled(value){
  const negative=value<0n,magnitude=negative?-value:value;
  if(magnitude>MAX_SCALED)fail('PLANNING_DECIMAL_RANGE','Das exakte Rechenergebnis überschreitet den Dezimalvertrag.');
  const whole=magnitude/SCALE,fraction=(magnitude%SCALE).toString().padStart(DECIMAL_PLACES,'0').replace(/0+$/,'');
  return (negative?'-':'')+whole+(fraction?'.'+fraction:'');
}

export function compareDecimal(left,right){const a=scaled(left),b=scaled(right);return a<b?-1:a>b?1:0;}
export function addDecimal(left,right){return fromScaled(scaled(left)+scaled(right));}
export function subtractDecimal(left,right){return fromScaled(scaled(left)-scaled(right));}
export function multiplyDecimal(left,right){
  const product=scaled(left)*scaled(right);
  if(product%SCALE!==0n)fail('PLANNING_DECIMAL_PRECISION_LOSS','Die Multiplikation benötigt mehr als 18 Nachkommastellen. Eine Rundungsregel muss ausdrücklich festgelegt werden.');
  return fromScaled(product/SCALE);
}
export function minDecimal(left,right){return compareDecimal(left,right)<=0?left:right;}
export function maxDecimal(left,right){return compareDecimal(left,right)>=0?left:right;}

/** Positive risk division, rounded down explicitly to the broker's unit step. */
export function divideToStepFloor(numerator,denominator,step){
  validateDecimal(numerator,{nonNegative:true});validateDecimal(denominator,{positive:true});validateDecimal(step,{positive:true});
  const n=scaled(numerator),d=scaled(denominator),s=scaled(step);
  // The ratio and step share fixed units; all discarded value stays unspent.
  return fromScaled((n*SCALE/(d*s))*s);
}

/** Explicitly rounds a nonnegative amount down; never raises it to a minimum. */
export function floorDecimalToStep(value,step){
  validateDecimal(value,{nonNegative:true});validateDecimal(step,{positive:true});
  const v=scaled(value),s=scaled(step);return fromScaled(v/s*s);
}
