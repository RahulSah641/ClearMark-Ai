// Original local editing implementation. No reference-site source or assets are used.
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeRect(rect) {
  const w = clamp(Number(rect.w) || .01, .01, .8);
  const h = clamp(Number(rect.h) || .01, .01, .8);
  return {x:clamp(Number(rect.x) || 0,0,1-w), y:clamp(Number(rect.y) || 0,0,1-h), w,h};
}

export function presetRect(preset, width, height) {
  const side = clamp(Math.min(width,height) * .105, 24, 180);
  if (preset === 'custom') return {x:.4,y:.4,w:.2,h:.2};
  const w = preset === 'veo' ? .12 : side / width;
  const h = preset === 'veo' ? .09 : side / height;
  const inset = preset === 'omni' ? .032 : .023;
  return normalizeRect({x:1-w-inset,y:1-h-inset,w,h});
}

export function pixelRect(rect, width, height) {
  const r = normalizeRect(rect);
  const x = clamp(Math.floor(r.x*width),0,width-1);
  const y = clamp(Math.floor(r.y*height),0,height-1);
  return {x,y,w:clamp(Math.ceil(r.w*width),1,width-x),h:clamp(Math.ceil(r.h*height),1,height-y)};
}

export function cloneRect(r,width,height,direction) {
  const gap = Math.max(2,Math.round(Math.min(width,height)*.004));
  const s = {...r};
  if(direction==='left') s.x-=r.w+gap;
  else if(direction==='right') s.x+=r.w+gap;
  else if(direction==='above') s.y-=r.h+gap;
  else s.y+=r.h+gap;
  if(s.x<0 || s.y<0 || s.x+s.w>width || s.y+s.h>height) return null;
  return s;
}

export function cropBounds(r,width,height) {
  const options = [
    {x:0,y:0,w:r.x,h:height,edge:'right'},
    {x:r.x+r.w,y:0,w:width-r.x-r.w,h:height,edge:'left'},
    {x:0,y:0,w:width,h:r.y,edge:'bottom'},
    {x:0,y:r.y+r.h,w:width,h:height-r.y-r.h,edge:'top'}
  ].filter(b=>b.w>=2 && b.h>=2);
  options.sort((a,b)=>b.w*b.h-a.w*a.h);
  if(!options.length) throw new Error('Make a smaller selection before cropping.');
  return options[0];
}

// A Coons surface reproduces linear color gradients from the four intact boundaries.
// It estimates hidden pixels; it is not a pretrained AI model or exact unblending.
export function repairPixels(image,rect,method='blend',softness=.08,direction='left') {
  const {data,width,height} = image;
  const r = pixelRect(rect,width,height);
  const source = method==='clone' ? cloneRect(r,width,height,direction) : null;
  if(method==='clone' && !source) throw new Error('There is not enough room to copy from that side. Choose another direction or shrink the selection.');
  const result = new Uint8ClampedArray(r.w*r.h*4);
  const left = Math.max(0,r.x-1), right=Math.min(width-1,r.x+r.w);
  const top = Math.max(0,r.y-1), bottom=Math.min(height-1,r.y+r.h);
  const feather = Math.max(0,Math.min(r.w,r.h)*softness);
  for(let y=0;y<r.h;y++) {
    const py = r.y+y;
    const v = (py-top)/Math.max(1,bottom-top);
    for(let x=0;x<r.w;x++) {
      const px=r.x+x, u=(px-left)/Math.max(1,right-left);
      const from=(py*width+px)*4, to=(y*r.w+x)*4;
      const edgeDistance=Math.min(x+1,y+1,r.w-x,r.h-y);
      const amount=feather>0 ? clamp(edgeDistance/feather,0,1) : 1;
      for(let c=0;c<4;c++) {
        let value;
        if(source) value=data[((source.y+y)*width+source.x+x)*4+c];
        else {
          const horizontal=(1-u)*data[(py*width+left)*4+c]+u*data[(py*width+right)*4+c];
          const vertical=(1-v)*data[(top*width+px)*4+c]+v*data[(bottom*width+px)*4+c];
          const corners=(1-u)*(1-v)*data[(top*width+left)*4+c]
            +u*(1-v)*data[(top*width+right)*4+c]
            +(1-u)*v*data[(bottom*width+left)*4+c]
            +u*v*data[(bottom*width+right)*4+c];
          value=clamp(horizontal+vertical-corners,0,255);
        }
        result[to+c]=data[from+c]*(1-amount)+value*amount;
      }
    }
  }
  // Mutate only after all boundary/clone reads. Pixels outside the selection stay intact.
  for(let y=0;y<r.h;y++) data.set(result.subarray(y*r.w*4,(y+1)*r.w*4),((r.y+y)*width+r.x)*4);
  return image;
}

export function videoMime() {
  if(typeof MediaRecorder==='undefined') return null;
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']
    .find(type=>MediaRecorder.isTypeSupported(type)) || null;
}

export function videoDimensions(width,height) {
  const scale=Math.min(1,1920/Math.max(width,height));
  return {w:Math.max(2,Math.floor(width*scale/2)*2),h:Math.max(2,Math.floor(height*scale/2)*2)};
}

export function formatTime(seconds) {
  const total=Math.max(0,Math.floor(Number(seconds)||0));
  return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
}
