// Analytic frequency response for RBJ-style biquad filters.
// Each coefficient array is [b0,b1,b2,a1,a2] with a0 normalized to 1.
export function biquadMagnitudeDb(coefficients,frequency,rate){
  if(!Array.isArray(coefficients)||coefficients.length!==5||
      !Number.isFinite(frequency)||frequency<0||frequency>rate/2||!Number.isFinite(rate)||rate<=0)
    throw Error('Invalid EQ response parameters.');
  const [b0,b1,b2,a1,a2]=coefficients;
  const w=2*Math.PI*frequency/rate;
  const co=Math.cos(w),si=Math.sin(w),co2=Math.cos(2*w),si2=Math.sin(2*w);
  const nr=b0+b1*co+b2*co2,ni=-b1*si-b2*si2;
  const dr=1+a1*co+a2*co2,di=-a1*si-a2*si2;
  const numerator=nr*nr+ni*ni,denominator=dr*dr+di*di;
  return 10*Math.log10(Math.max(1e-20,numerator)/Math.max(1e-20,denominator));
}
export function eqResponseCurve(filters,rate){
  const points=[35,65,110,180,300,500,1000,2000,4000,8000,12000]
    .filter(hz=>hz<rate/2);
  return points.map(hz=>({
    hz,
    db:Math.round(filters.reduce((sum,coeff)=>sum+biquadMagnitudeDb(coeff,hz,rate),0)*100)/100
  }));
}
export function peakingBiquad(rate,frequency,gainDb,q=1){
  if(!Number.isFinite(rate)||rate<8000||!Number.isFinite(gainDb)||
    !Number.isFinite(q)||q<=0)throw Error('Invalid bell EQ settings.');
  const f=Math.min(rate*.45,Math.max(1,frequency));
  const w=2*Math.PI*f/rate,A=10**(gainDb/40),alpha=Math.sin(w)/(2*q),cos=Math.cos(w);
  const norm=1+alpha/A;
  return [(1+alpha*A)/norm,-2*cos/norm,(1-alpha*A)/norm,
    -2*cos/norm,(1-alpha/A)/norm];
}
