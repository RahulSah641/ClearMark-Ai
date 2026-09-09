import {clamp,normalizeRect,presetRect,pixelRect,cloneRect,cropBounds,repairPixels,videoMime,videoDimensions,formatTime} from './engine.mjs';

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = {kind:'image',preset:'gemini',rect:{x:.87,y:.84,w:.1,h:.12},view:'original',method:'blend',softness:.08,direction:'left',source:null,width:0,height:0,file:null,url:null,video:null,downloadURL:null,busy:false,loading:false,loadToken:0,drawing:false,drag:null,raf:0,renderQueued:false,cancel:null,audioContext:null,audioSource:null,audioDestination:null,session:0};
const preview=$('preview'), previewContext=preview.getContext('2d');
const frame=document.createElement('canvas'), frameContext=frame.getContext('2d',{willReadFrequently:true});
let resultFrame=document.createElement('canvas');
const message=(text,error=false)=>{const el=$('message');el.hidden=!text;el.textContent=text;el.classList.toggle('error',error);};
const sizeLabel=bytes=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.round(bytes/1024)} KB`;
const stem=name=>(name||'clearframe').replace(/\.[^.]+$/,'').replace(/[<>:"/\\|?*\x00-\x1F]/g,'-').slice(0,100);
const hasSource=()=>!!state.source;

function setStep(n) { for(let i=1;i<=3;i++){const el=$(`step-${i}`);el.classList.toggle('current',i===n);el.classList.toggle('done',i<n);if(i===n)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');} }

function clearDownload(){
  $('download-ready').hidden=true;
  $('download-link').removeAttribute('href');
  if(state.downloadURL)URL.revokeObjectURL(state.downloadURL);
  state.downloadURL=null;
}

function releaseMedia(){
  cancelAnimationFrame(state.raf);
  state.raf=0;
  if(state.video){state.video.pause();state.video.removeAttribute('src');state.video.load();}
  if(state.audioContext){state.audioContext.close().catch(()=>{});}
  state.audioContext=null;state.audioSource=null;state.audioDestination=null;
  if(state.source?.close)state.source.close();
  if(state.url)URL.revokeObjectURL(state.url);
  state.url=null;state.video=null;state.source=null;state.width=0;state.height=0;state.file=null;
  state.drawing=false;state.drag=null;state.session++;
  $('stage').classList.remove('drawing');$('draw-selection').classList.remove('armed');
  $('video-play').innerHTML='<svg><use href="#i-play"/></svg>';
  $('video-play').setAttribute('aria-label','Play preview');
  clearDownload();
}

function syncControls(){
  const loaded=hasSource(), locked=state.busy||state.loading;
  $('selection-controls').disabled=!loaded||locked;
  $('export').disabled=!loaded||locked;
  $('reset').disabled=!loaded||locked;
  ['choose-file','browse','clear-file','image-tab','video-tab','try-demo'].forEach(id=>$(id).disabled=locked);
  $$('.preset').forEach(el=>el.disabled=locked);
  $$('[data-view]').forEach(el=>{el.disabled=!loaded||locked||(state.method==='crop'&&el.dataset.view==='compare');el.classList.toggle('active',el.dataset.view===state.view);el.setAttribute('aria-pressed',String(el.dataset.view===state.view));});
  $('video-play').disabled=locked;$('video-seek').disabled=locked;
  $('drop-zone').hidden=loaded;$('stage-area').hidden=!loaded;
  $('selected-file').hidden=!loaded;$('video-controls').hidden=!loaded||state.kind!=='video';
  $('clone-controls').hidden=state.method!=='clone';$('feather-control').hidden=state.method==='crop';
  $('export-progress').hidden=!state.busy;
  $('feather-value').value=`${Math.round(state.softness*100)}%`;
  $('compare-control').hidden=state.view!=='compare'||!loaded;
  $('compare-line').hidden=state.view!=='compare'||!loaded;
  $('before-label').hidden=state.view!=='compare'||!loaded;
  $('after-label').hidden=state.view!=='compare'||!loaded;
  $('selection').hidden=!loaded||state.view!=='original'||state.busy;
  $('method-note').textContent=state.method==='blend'?'Best for small marks on simple backgrounds. Fine detail may soften.':state.method==='clone'?'Best when a clean nearby area has similar color and texture.':'Removes the nearest edge of the frame and changes the dimensions.';
  const mime=videoMime();
  $('output-type').textContent=state.kind==='image'?'PNG':mime?.includes('mp4')?'MP4':mime?'WebM':'Unavailable';
  $('export-label').textContent=state.busy?'Preparing your file…':`Download ${state.kind}`;
  if(state.kind==='video') {
    const dims=loaded?videoDimensions(state.width,state.height):null;
    $('export-note').textContent=`${dims?`${dims.w} × ${dims.h} px · `:''}Up to 30 fps. Audio included when decodable. Export takes about the clip’s duration.`;
    if(!mime||!HTMLCanvasElement.prototype.captureStream){$('export').disabled=true;$('export-note').textContent='Video export is unavailable in this browser. Try an up-to-date Chrome, Edge, or Safari.';}
  } else $('export-note').textContent=state.method==='crop'?'Cropped dimensions. Saves a new PNG copy.':'Full image dimensions. Preview before saving.';
  if(loaded && state.method==='clone'&&!cloneRect(pixelRect(state.rect,state.width,state.height),state.width,state.height,state.direction)){$('export').disabled=true;$('method-note').textContent='Not enough space on this side. Choose another copy direction or make the box smaller.';}
  syncSelection();
}

function setKind(kind){
  if(state.busy||state.loading)return;
  if(state.kind!==kind){state.loadToken++;releaseMedia();}
  state.kind=kind;
  const isImage=kind==='image';
  $$('[data-kind]').forEach(el=>{el.classList.toggle('active',el.dataset.kind===kind);el.setAttribute('aria-pressed',String(el.dataset.kind===kind));});
  $('file-input').accept=isImage?'image/png,image/jpeg,image/webp':'video/mp4,video/webm,video/quicktime,.mov';
  $('file-button-label').textContent=isImage?'Upload an image':'Upload a video';
  $('browse-label').textContent=isImage?'Choose image':'Choose video';
  $('drop-title').textContent=isImage?'Give your image a fresh start.':'Give your video a clean finish.';
  $('drop-formats').textContent=isImage?'PNG · JPG · WebP':'MP4 · WebM · MOV';
  $('format-note').textContent=isImage?'PNG, JPG or WebP · up to 30 MB':'MP4, WebM or MOV · up to 250 MB · 90 sec';
  $('try-demo').closest('.demo-line').hidden=!isImage;
  document.querySelector('.upload-symbol>svg use').setAttribute('href',isImage?'#i-image':'#i-video');
  if(!hasSource()){$('dimension-label').textContent='Nothing uploaded yet';setStep(1);message('');state.view='original';}
  syncControls();
}

function setPreset(preset){
  if(state.busy||state.loading)return;
  state.preset=preset;
  $$('.preset').forEach(el=>{el.classList.toggle('active',el.dataset.preset===preset);el.setAttribute('aria-pressed',String(el.dataset.preset===preset));});
  if(hasSource()){state.rect=presetRect(preset,state.width,state.height);changed();}
  syncSelection();
}

function setView(view){
  if(!hasSource()||state.busy)return;
  if(state.method==='crop'&&view==='compare')return;
  state.view=view;state.drawing=false;
  $('stage').classList.remove('drawing');$('draw-selection').classList.remove('armed');
  syncControls();queueRender();
}

function syncSelection(){
  const r=normalizeRect(state.rect);state.rect=r;
  for(const key of ['x','y','w','h']){const input=$(`rect-${key}`);if(document.activeElement!==input)input.value=(r[key]*100).toFixed(1);}
  const el=$('selection');el.style.left=`${r.x*100}%`;el.style.top=`${r.y*100}%`;el.style.width=`${r.w*100}%`;el.style.height=`${r.h*100}%`;
  const clone=hasSource()&&state.method==='clone'?cloneRect(pixelRect(r,state.width,state.height),state.width,state.height,state.direction):null;
  const box=$('clone-box');box.hidden=!clone||state.view!=='original'||state.busy;
  if(clone){box.style.left=`${clone.x/state.width*100}%`;box.style.top=`${clone.y/state.height*100}%`;box.style.width=`${clone.w/state.width*100}%`;box.style.height=`${clone.h/state.height*100}%`;}
}

function changed(){
  clearDownload();setStep(2);message('');syncControls();queueRender();
}

function queueRender(){
  if(state.renderQueued)return;state.renderQueued=true;
  requestAnimationFrame(()=>{state.renderQueued=false;if(hasSource()&&!state.busy)renderPreview();});
}

function drawEdited(source,target,w,h,method=state.method){
  const r=pixelRect(state.rect,w,h);
  if(method==='crop'){
    const crop=cropBounds(r,w,h);
    if(target.width!==crop.w)target.width=crop.w;if(target.height!==crop.h)target.height=crop.h;
    const context=target.getContext('2d');context.clearRect(0,0,target.width,target.height);
    const sw=state.width/w,sh=state.height/h;
    context.drawImage(source,crop.x*sw,crop.y*sh,crop.w*sw,crop.h*sh,0,0,crop.w,crop.h);
    return;
  }
  if(target.width!==w)target.width=w;if(target.height!==h)target.height=h;
  const context=target.getContext('2d',{willReadFrequently:true});
  context.clearRect(0,0,w,h);context.drawImage(source,0,0,w,h);
  const pixels=context.getImageData(0,0,w,h);
  repairPixels(pixels,state.rect,method,state.softness,state.direction);
  context.putImageData(pixels,0,0);
}

function renderPreview(){
  if(!hasSource()||state.busy)return;
  try{
    const maxWidth=Math.max(200,$('stage-area').clientWidth-36);
    const maxHeight=window.innerWidth<=650?430:500;
    const scale=Math.min(1,Math.min(maxWidth,1000)/state.width,maxHeight/state.height);
    const w=Math.max(2,Math.round(state.width*scale)),h=Math.max(2,Math.round(state.height*scale));
    if(frame.width!==w)frame.width=w;if(frame.height!==h)frame.height=h;
    frameContext.clearRect(0,0,w,h);frameContext.drawImage(state.source,0,0,w,h);
    if(state.view==='original'){
      if(preview.width!==w)preview.width=w;if(preview.height!==h)preview.height=h;
      previewContext.clearRect(0,0,w,h);previewContext.drawImage(frame,0,0);
    }else{
      drawEdited(state.source,resultFrame,w,h);
      if(preview.width!==resultFrame.width)preview.width=resultFrame.width;
      if(preview.height!==resultFrame.height)preview.height=resultFrame.height;
      previewContext.clearRect(0,0,preview.width,preview.height);previewContext.drawImage(resultFrame,0,0);
      if(state.view==='compare'){
        const position=Number($('compare-range').value)/100;
        previewContext.save();previewContext.beginPath();previewContext.rect(0,0,w*position,h);previewContext.clip();previewContext.drawImage(frame,0,0);previewContext.restore();
        $('compare-line').style.left=`${position*100}%`;
      }
    }
    $('stage').style.width=`${preview.width}px`;
    const crop=state.method==='crop'?cropBounds(pixelRect(state.rect,state.width,state.height),state.width,state.height):null;
    $('dimension-label').textContent=crop&&state.view!=='original'?`${crop.w} × ${crop.h} px · cropped`:`${state.width} × ${state.height} px`;
    $('canvas-tip').textContent=state.view==='original'?'Drag the box over the watermark.':state.view==='compare'?'Move the slider to compare.':state.method==='crop'?'This is the frame you will keep.':'Check the repaired area before saving.';
    syncSelection();
    if(state.video){$('video-seek').value=String(Math.round(state.video.currentTime/state.video.duration*1000)||0);$('video-time').textContent=`${formatTime(state.video.currentTime)} / ${formatTime(state.video.duration)}`;}
  }catch(error){message(error.message||'This frame could not be processed.',true);$('export').disabled=true;}
}

function waitEvent(target,event,timeout=20000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(new Error('The file took too long to open. Try a smaller file or a different format.'));},timeout);
    const cleanup=()=>{clearTimeout(timer);target.removeEventListener(event,ok);target.removeEventListener('error',bad);};
    const ok=()=>{cleanup();resolve();};
    const bad=()=>{cleanup();reject(new Error('Your browser cannot decode this file. Try a PNG/JPG image or an H.264 MP4 video.'));};
    target.addEventListener(event,ok,{once:true});target.addEventListener('error',bad,{once:true});
  });
}

async function loadFile(file){
  if(!file||state.busy||state.loading)return;
  const ext=file.name.split('.').pop().toLowerCase();
  const kind=/^(png|jpg|jpeg|webp)$/.test(ext)||/^image\/(png|jpeg|webp)$/.test(file.type)?'image':/^(mp4|webm|mov)$/.test(ext)||/^video\/(mp4|webm|quicktime)$/.test(file.type)?'video':null;
  if(!kind){message('Choose a PNG, JPG or WebP image, or an MP4, WebM or MOV video.',true);return;}
  if(file.size>(kind==='image'?30:250)*1024*1024){message(`This file is too large. The ${kind} limit is ${kind==='image'?30:250} MB.`,true);return;}
  const token=++state.loadToken;state.loading=true;syncControls();message('Opening your file on this device…');
  let source=null,url=URL.createObjectURL(file);
  try{
    let width,height;
    if(kind==='image'){
      const img=new Image();const waiting=waitEvent(img,'load');img.src=url;await waiting;
      width=img.naturalWidth;height=img.naturalHeight;
      if(!width||!height||width*height>24000000||width>16384||height>16384)throw new Error('Use an image up to 24 megapixels and 16,384 pixels per side.');
      source=img;
    }else{
      const video=document.createElement('video');video.preload='auto';video.playsInline=true;video.muted=true;
      const waiting=waitEvent(video,'loadeddata');video.src=url;video.load();await waiting;
      // Some browser-recorded WebM files omit duration metadata. Let the decoder find the end.
      if(!Number.isFinite(video.duration)){await seekVideo(video,1e9);await seekVideo(video,0);}
      if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>90){video.pause();video.removeAttribute('src');video.load();throw new Error('Choose a video with a duration of 90 seconds or less.');}
      width=video.videoWidth;height=video.videoHeight;
      if(!width||!height)throw new Error('This video has no readable picture track.');
      source=video;
    }
    if(token!==state.loadToken){URL.revokeObjectURL(url);return;}
    state.loading=false;releaseMedia();setKind(kind);
    state.source=source;state.video=kind==='video'?source:null;state.url=url;url=null;state.file=file;state.width=width;state.height=height;
    state.rect=presetRect(state.preset,width,height);state.view='original';state.method='blend';$('method').value='blend';
    if(state.video){
      state.video.addEventListener('seeked',queueRender);
      state.video.addEventListener('ended',()=>{if(!state.busy){$('video-play').innerHTML='<svg><use href="#i-play"/></svg>';$('video-play').setAttribute('aria-label','Play preview');queueRender();}});
    }
    $('file-name').textContent=file.name;$('file-name').title=file.name;
    $('file-meta').textContent=`${sizeLabel(file.size)}${kind==='video'?` · ${formatTime(source.duration)}`:''}`;
    document.querySelector('#selected-file>svg use').setAttribute('href',kind==='image'?'#i-image':'#i-video');
    clearDownload();setStep(2);syncControls();queueRender();
    message(kind==='video'?'Position the box, then check a few points in the video. The box stays fixed throughout the clip.':'Move or resize the box, then choose Result or Compare to see the edit.');
  }catch(error){
    if(url)URL.revokeObjectURL(url);
    if(source?.tagName==='VIDEO'){source.pause();source.removeAttribute('src');source.load();}
    message(error.message||'We could not open that file.',true);
  }finally{if(token===state.loadToken){state.loading=false;syncControls();} $('file-input').value='';}
}

function saveBlob(blob,extension){
  if(!blob?.size)throw new Error('The browser returned an empty file. Try a smaller file.');
  clearDownload();state.downloadURL=URL.createObjectURL(blob);
  const link=$('download-link');link.href=state.downloadURL;link.download=`${stem(state.file?.name)}-clearframe.${extension}`;
  $('download-ready').hidden=false;setStep(3);link.click();
}

async function exportImage(){
  state.busy=true;state.cancel=()=>{state.imageCancelled=true;};state.imageCancelled=false;
  $('progress').value=10;$('progress-label').textContent='Preparing full-resolution PNG…';syncControls();message('');
  try{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(state.imageCancelled)throw new Error('Export cancelled. Your original file is unchanged.');
    const output=document.createElement('canvas');drawEdited(state.source,output,state.width,state.height);
    $('progress').value=75;
    const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));
    output.width=1;output.height=1;
    if(state.imageCancelled)throw new Error('Export cancelled. Your original file is unchanged.');
    saveBlob(blob,'png');$('progress').value=100;message('Your PNG is ready. Use “Save file” if your browser did not start the download.');
  }catch(error){message(error.message||'The image could not be exported.',true);}
  finally{state.busy=false;state.cancel=null;syncControls();queueRender();}
}

function pauseVideo(){
  state.video?.pause();cancelAnimationFrame(state.raf);state.raf=0;
  $('video-play').innerHTML='<svg><use href="#i-play"/></svg>';$('video-play').setAttribute('aria-label','Play preview');
}

async function seekVideo(video,time){
  if(Math.abs(video.currentTime-time)<.005)return;
  const waiting=waitEvent(video,'seeked');video.currentTime=time;await waiting;
}

async function exportVideo(){
  const mime=videoMime();if(!mime){message('Video export is not available in this browser.',true);return;}
  const video=state.video;pauseVideo();const savedTime=video.currentTime;
  state.busy=true;syncControls();message('');$('progress').value=0;$('progress-label').textContent='Preparing video and audio…';
  const dimensions=videoDimensions(state.width,state.height);
  const output=document.createElement('canvas');let stream=null,recorder=null,stopFrame=null,wakeLock=null,watchdog=null,visibilityHandler=null,cancelReason=null;
  let chunks=[],bytes=0,settled=false,finishRecording=null,setupCancelled=false;
  state.cancel=()=>{setupCancelled=true;};
  const checkSetup=()=>{if(setupCancelled)throw new Error('Export cancelled. Your original file is unchanged.');};
  try{
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)throw new Error('This browser cannot prepare the video audio. Try a recent Chrome, Edge, or Safari.');
    if(!state.audioContext){
      state.audioContext=new AudioContextClass();
      state.audioSource=state.audioContext.createMediaElementSource(video);
      state.audioDestination=state.audioContext.createMediaStreamDestination();
      state.audioSource.connect(state.audioDestination);
    }
    await state.audioContext.resume();checkSetup();
    if(state.audioContext.state!=='running')throw new Error('Audio could not start. Click Download video again or try another browser.');
    video.muted=false;video.volume=1;
    await seekVideo(video,0);checkSetup();drawEdited(video,output,dimensions.w,dimensions.h);
    // Even encoded dimensions avoid H.264 rejection after a crop.
    const encoded=document.createElement('canvas');encoded.width=Math.max(2,Math.floor(output.width/2)*2);encoded.height=Math.max(2,Math.floor(output.height/2)*2);
    const ec=encoded.getContext('2d');ec.drawImage(output,0,0,encoded.width,encoded.height);
    stream=encoded.captureStream(30);
    for(const track of state.audioDestination.stream.getAudioTracks())stream.addTrack(track.clone());
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:Math.min(14000000,Math.max(2500000,encoded.width*encoded.height*5)),audioBitsPerSecond:160000});
    const completed=new Promise((resolve,reject)=>{
      finishRecording=error=>{
        if(settled)return;settled=true;
        if(error)cancelReason=error;
        video.pause();if(stopFrame)stopFrame();
        if(recorder.state!=='inactive')recorder.stop();
        else if(error)reject(error);
      };
      recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);bytes+=event.data.size;if(bytes>300*1024*1024)finishRecording(new Error('The export grew too large for this browser session. Try a shorter clip.'));}};
      recorder.onerror=()=>{cancelReason=new Error('The browser could not encode this video. Try a smaller H.264 MP4 in a different browser.');finishRecording(cancelReason);};
      recorder.onstop=()=>{if(cancelReason)reject(cancelReason);else resolve(new Blob(chunks,{type:recorder.mimeType||mime}));};
    });
    // Attach a rejection handler immediately; playback setup can fail before awaiting completion.
    completed.catch(()=>{});
    state.cancel=()=>finishRecording(new Error('Export cancelled. Your original file is unchanged.'));
    visibilityHandler=()=>{if(document.hidden)finishRecording(new Error('Export paused because this tab was hidden. Keep it visible and start the export again.'));};
    document.addEventListener('visibilitychange',visibilityHandler);
    if(document.hidden)throw new Error('Keep this tab visible and start the export again.');
    if(navigator.wakeLock)wakeLock=await navigator.wakeLock.request('screen').catch(()=>null);
    if(settled)await completed;
    let frameID=0,usesVideoFrames=typeof video.requestVideoFrameCallback==='function';
    stopFrame=()=>{if(usesVideoFrames)video.cancelVideoFrameCallback(frameID);else cancelAnimationFrame(frameID);};
    let lastProgress=Date.now(),lastTime=-1;
    const tick=()=>{
      if(settled)return;
      try{
        drawEdited(video,output,dimensions.w,dimensions.h);ec.drawImage(output,0,0,encoded.width,encoded.height);
        const percent=Math.min(99,Math.round(video.currentTime/video.duration*100));
        $('progress').value=percent;$('progress-label').textContent=`Exporting ${percent}% · ${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
        if(video.currentTime>lastTime){lastProgress=Date.now();lastTime=video.currentTime;}
        if(!video.ended)frameID=usesVideoFrames?video.requestVideoFrameCallback(tick):requestAnimationFrame(tick);
      }catch(error){finishRecording(error);}
    };
    const ended=()=>{try{drawEdited(video,output,dimensions.w,dimensions.h);ec.drawImage(output,0,0,encoded.width,encoded.height);}catch{} finishRecording();};
    video.addEventListener('ended',ended,{once:true});
    const mediaError=()=>finishRecording(new Error('Playback stopped while exporting. Try converting the original video to H.264 MP4.'));
    video.addEventListener('error',mediaError,{once:true});
    watchdog=setInterval(()=>{if(Date.now()-lastProgress>20000)finishRecording(new Error('Video playback stalled. Try a smaller or shorter clip.'));},2000);
    recorder.start(500);
    frameID=usesVideoFrames?video.requestVideoFrameCallback(tick):requestAnimationFrame(tick);
    try{await video.play();}catch{finishRecording(new Error('Playback was blocked. Click Download video again to restart it.'));}
    let blob;
    try{blob=await completed;}finally{video.removeEventListener('ended',ended);video.removeEventListener('error',mediaError);}
    $('progress').value=100;
    const extension=blob.type.includes('mp4')?'mp4':'webm';saveBlob(blob,extension);
    message(`Your ${extension.toUpperCase()} is ready at ${encoded.width} × ${encoded.height} px. Video and any decodable audio were re-encoded. Play the downloaded file to check the result.`);
  }catch(error){message(error.message||'Video export failed. Try a shorter clip or a different browser.',true);}
  finally{
    if(stopFrame)stopFrame();if(watchdog)clearInterval(watchdog);
    if(visibilityHandler)document.removeEventListener('visibilitychange',visibilityHandler);
    video.pause();video.muted=true;
    if(recorder&&recorder.state!=='inactive'){cancelReason=new Error('Export stopped.');recorder.stop();}
    if(stream)stream.getTracks().forEach(track=>track.stop());
    if(wakeLock)await wakeLock.release().catch(()=>{});
    if(state.audioContext)await state.audioContext.suspend().catch(()=>{});
    await seekVideo(video,Math.min(savedTime,video.duration-.01)).catch(()=>{});
    state.busy=false;state.cancel=null;chunks=[];syncControls();queueRender();
  }
}

function sample(){
  if(state.busy||state.loading)return;releaseMedia();setKind('image');
  const c=document.createElement('canvas');c.width=1080;c.height=720;const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,1080,720);g.addColorStop(0,'#192d65');g.addColorStop(1,'#718dca');x.fillStyle=g;x.fillRect(0,0,1080,720);
  x.fillStyle='#d7ff80';x.fillRect(68,72,80,7);x.font='500 17px system-ui';x.fillStyle='#c7d6fb';x.fillText('CLEARFRAME  /  PRACTICE CANVAS',68,124);
  x.fillStyle='white';x.font='650 95px system-ui';x.fillText('Make space.',60,305);x.fillText('For your ideas.',60,420);
  x.font='400 22px system-ui';x.fillStyle='#d9e4ff';x.fillText('An original sample to explore the editor.',68,495);
  x.strokeStyle='#e1ecff50';x.lineWidth=1;x.beginPath();x.moveTo(68,554);x.lineTo(1012,554);x.stroke();
  x.font='500 16px system-ui';x.fillStyle='#d9e4ff';x.fillText('YOUR DEVICE. YOUR FILES.',68,627);
  x.font='700 29px system-ui';x.fillStyle='#ffffffa6';x.fillText('SAMPLE',868,627);
  state.source=c;state.width=1080;state.height=720;state.file={name:'clearframe-sample.png',size:0};
  state.method='blend';$('method').value='blend';state.softness=.08;$('feather').value='8';
  state.rect={x:.787,y:.817,w:.155,h:.07};state.view='compare';
  $('file-name').textContent='clearframe-sample.png';$('file-meta').textContent='Original practice canvas';
  setStep(2);syncControls();queueRender();message('This sample uses the same repair as your files. Move the comparison slider over the SAMPLE mark in the lower-right corner.');
}

function point(event){const b=$('stage').getBoundingClientRect();return {x:clamp((event.clientX-b.left)/b.width,0,1),y:clamp((event.clientY-b.top)/b.height,0,1)};}
const stage=$('stage');
stage.addEventListener('pointerdown',event=>{
  if(!hasSource()||state.busy||state.view!=='original')return;
  const p=point(event);
  if(state.drawing){state.drag={mode:'draw',start:p,rect:{...state.rect}};state.rect={x:p.x,y:p.y,w:.01,h:.01};}
  else if(event.target.closest('#selection'))state.drag={mode:event.target.dataset.resize?'resize':'move',start:p,rect:{...state.rect}};
  else return;
  pauseVideo();stage.setPointerCapture(event.pointerId);event.preventDefault();changed();
});
stage.addEventListener('pointermove',event=>{
  const d=state.drag;if(!d)return;const p=point(event),dx=p.x-d.start.x,dy=p.y-d.start.y;
  if(d.mode==='draw')state.rect=normalizeRect({x:Math.min(p.x,d.start.x),y:Math.min(p.y,d.start.y),w:Math.abs(dx),h:Math.abs(dy)});
  else if(d.mode==='move')state.rect=normalizeRect({...d.rect,x:d.rect.x+dx,y:d.rect.y+dy});
  else state.rect=normalizeRect({...d.rect,w:clamp(d.rect.w+dx,.01,1-d.rect.x),h:clamp(d.rect.h+dy,.01,1-d.rect.y)});
  syncSelection();queueRender();
});
function endDrag(){if(!state.drag)return;state.drag=null;state.drawing=false;stage.classList.remove('drawing');$('draw-selection').classList.remove('armed');syncControls();queueRender();}
stage.addEventListener('pointerup',endDrag);stage.addEventListener('pointercancel',endDrag);stage.addEventListener('lostpointercapture',endDrag);
$('selection').addEventListener('keydown',event=>{
  if(!hasSource()||state.busy)return;const amount=event.shiftKey ? .01 : .001;
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();state.rect=normalizeRect({...state.rect,x:state.rect.x+(event.key==='ArrowRight'?amount:event.key==='ArrowLeft'?-amount:0),y:state.rect.y+(event.key==='ArrowDown'?amount:event.key==='ArrowUp'?-amount:0)});changed();
});

['choose-file','browse'].forEach(id=>$(id).addEventListener('click',()=>$('file-input').click()));
$('file-input').addEventListener('change',event=>loadFile(event.target.files?.[0]));
$$('[data-kind]').forEach(el=>el.addEventListener('click',()=>setKind(el.dataset.kind)));
$$('[data-preset]').forEach(el=>el.addEventListener('click',()=>setPreset(el.dataset.preset)));
$$('[data-view]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.view)));
$('clear-file').addEventListener('click',()=>{if(state.busy)return;state.loadToken++;releaseMedia();setKind(state.kind);});
$('draw-selection').addEventListener('click',()=>{pauseVideo();setView('original');state.drawing=true;stage.classList.add('drawing');$('draw-selection').classList.add('armed');message('Drag on the image to draw a box around the watermark.');stage.scrollIntoView({block:'nearest',behavior:'smooth'});});
for(const key of ['x','y','w','h'])$(`rect-${key}`).addEventListener('change',event=>{state.rect=normalizeRect({...state.rect,[key]:Number(event.target.value)/100});changed();event.target.value=(state.rect[key]*100).toFixed(1);});
$('method').addEventListener('change',event=>{state.method=event.target.value;if(state.method==='crop'&&state.view==='compare')state.view='result';changed();});
$('clone-direction').addEventListener('change',event=>{state.direction=event.target.value;changed();});
$('feather').addEventListener('input',event=>{state.softness=Number(event.target.value)/100;changed();});
$('compare-range').addEventListener('input',queueRender);
$('reset').addEventListener('click',()=>{pauseVideo();state.rect=presetRect(state.preset,state.width,state.height);state.method='blend';state.softness=.08;state.direction='left';state.view='original';$('method').value='blend';$('feather').value='8';$('clone-direction').value='left';changed();});
$('try-demo').addEventListener('click',sample);
$('export').addEventListener('click',()=>{if(!hasSource()||state.busy)return;state.kind==='image'?exportImage():exportVideo();});
$('cancel-export').addEventListener('click',()=>state.cancel?.());
$('about-button').addEventListener('click',()=>$('about-dialog').showModal());
$('close-about').addEventListener('click',()=>$('about-dialog').close());
$('about-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.currentTarget.close();}});
const workspace=$('workspace');
workspace.addEventListener('dragover',event=>{event.preventDefault();if(!state.busy)$('drop-zone').classList.add('dragging');});
workspace.addEventListener('dragleave',event=>{if(!workspace.contains(event.relatedTarget))$('drop-zone').classList.remove('dragging');});
workspace.addEventListener('drop',event=>{event.preventDefault();$('drop-zone').classList.remove('dragging');if(state.busy||state.loading)return;const files=event.dataTransfer.files;if(files.length>1){message('Choose one file at a time for this editor.',true);return;}loadFile(files[0]);});
window.addEventListener('dragover',event=>event.preventDefault());window.addEventListener('drop',event=>event.preventDefault());
$('video-play').addEventListener('click',async()=>{
  const video=state.video;if(!video||state.busy)return;
  if(!video.paused){pauseVideo();return;}
  if(video.ended)await seekVideo(video,0).catch(()=>{});
  try{
    video.muted=true;await video.play();$('video-play').textContent='Ⅱ';$('video-play').setAttribute('aria-label','Pause preview');
    const tick=()=>{if(!state.video||video.paused||state.busy)return;renderPreview();state.raf=requestAnimationFrame(tick);};tick();
    message('Preview playback is muted. Decodable original audio is included during export.');
  }catch{message('The video could not play. Try a different format.',true);}
});
$('video-seek').addEventListener('input',event=>{if(!state.video||state.busy)return;pauseVideo();state.video.currentTime=Number(event.target.value)/1000*state.video.duration;});
window.addEventListener('resize',queueRender);
window.addEventListener('beforeunload',event=>{if(state.busy){event.preventDefault();event.returnValue='';}});
setKind('image');setStep(1);
