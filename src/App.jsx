import React,{useRef,useState} from 'react';
import {Check,FilePlus2,Settings,ClipboardList,ShieldCheck,X} from 'lucide-react';
import RecordingHistoryDrawer from './components/voice/RecordingHistoryDrawer.jsx';
import VoiceCapturePanel from './components/voice/VoiceCapturePanel.jsx';
import useRecordingHistory,{DEMO_DRAFT_ID} from './hooks/useRecordingHistory.js';
import useVoiceRecorder from './hooks/useVoiceRecorder.js';
import { DOMAIN_VOCABULARY } from './config/domainVocabulary.js';
import { createTranscriptSelection, getWorkingTranscript } from './services/transcriptModel.js';

const EMPTY={entityName:'',entityType:'',tsp:'',services:'',bankName:'',branchName:'',assignedBy:'',date:''};
const LABELS={entityName:'Entity Name',entityType:'Entity Type',tsp:'TSP',services:'Services',bankName:'Bank Name',branchName:'Branch Name',assignedBy:'Task Assigned By',date:'Date'};
const OPTIONS={entityType:['Private Limited','Public Limited','Partnership','LLP','Proprietorship'],bankName:['HDFC Bank','ICICI Bank','State Bank of India','Axis Bank'],assignedBy:['Santhosh','Raj','Linto','Maheshwaran']};
const BRANCHES={'HDFC Bank':['Chennai','Bengaluru','Mumbai'],'ICICI Bank':['Chennai','Hyderabad','Delhi'],'State Bank of India':['Chennai','Coimbatore','Mumbai'],'Axis Bank':['Chennai','Pune','Delhi']};
const GEMINI_OPTIONS={...OPTIONS,branches:BRANCHES,domainVocabulary:DOMAIN_VOCABULARY};
const clean=v=>String(v||'').trim();
function optionMatch(value,options){if(!value)return '';return options.find(x=>x.toLowerCase()===clean(value).toLowerCase())||options.find(x=>x.toLowerCase().includes(clean(value).toLowerCase()))||'';}
function normalize(raw,existing){const result={};for(const key of Object.keys(EMPTY)){let value=clean(raw[key]);if(!value)continue;if(OPTIONS[key])value=optionMatch(value,OPTIONS[key]);if(key==='branchName'){const bank=raw.bankName?optionMatch(raw.bankName,OPTIONS.bankName):existing.bankName;value=optionMatch(value,BRANCHES[bank]||[]);}if(key==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(value))value='';if(value)result[key]=value;}return result;}
function normalizeUnmatched(raw){if(!raw||typeof raw!=='object')return {};return Object.fromEntries(Object.entries(raw).filter(([key,value])=>Object.hasOwn(LABELS,key)&&typeof value==='string'&&value.trim()).map(([key,value])=>[key,value.trim()]));}
function safeVoiceError(error){const message=String(error?.message||'').toLowerCase();if(message.includes('speech recognition is unavailable'))return 'Browser speech recognition is unavailable. Audio capture can continue, and Gemini Audio can transcribe after recording.';if(message.includes('speech recognition:'))return 'Browser speech recognition stopped unexpectedly. The audio will still be saved; use Gemini Audio if no transcript is available.';if(message.includes('audio recording is unavailable')||message.includes('microphone capture is unavailable'))return 'Audio recording is not supported in this browser.';if(error?.name==='NotAllowedError'||message.includes('permission denied'))return 'Microphone permission was denied. Allow microphone access and try again.';if(error?.name==='NotFoundError'||message.includes('no microphone'))return 'No microphone was found. Connect a microphone and try again.';if(error?.name==='NotReadableError')return 'The microphone is busy or unavailable. Close other apps using it and retry.';if(message.includes('quota')||message.includes('storage full'))return 'Browser storage is full. Free some space and retry saving.';if(message.includes('indexeddb')||message.includes('storage transaction'))return 'Local recording storage is unavailable. Check browser storage settings and retry.';if(message.includes('gemini_api_key')||message.includes('gemini_model'))return 'Voice processing is not configured. Contact your application administrator.';if(message.includes('audio exceeds')||message.includes('unsupported audio')||message.includes('too short'))return error.message;if(message.includes('failed to fetch')||message.includes('network'))return 'Could not reach voice processing. Your saved recording is available to retry.';return 'Voice processing failed. Your saved recording is available to retry.';}
function Field({label,required,children}){return <div><label className="field-label">{label} {required&&<span className="required">*</span>}</label>{children}</div>}
function Section({num,title,children}){return <section className="panel"><h2 className="font-bold text-[16px] mb-5 flex items-center gap-3"><span className="bg-[#1d3c6c] text-white rounded-md px-2 py-1 text-xs">{num}</span>{title}</h2><div className="grid md:grid-cols-2 gap-x-14 gap-y-4">{children}</div></section>}
function createRecordingId(){if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();if(globalThis.crypto?.getRandomValues){const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;return [...bytes].map((byte,index)=>{const hex=byte.toString(16).padStart(2,'0');return [4,6,8,10].includes(index)?`-${hex}`:hex;}).join('');}return `recording-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;}
function audioExtension(mimeType=''){if(mimeType.includes('mp4'))return 'mp4';if(mimeType.includes('ogg'))return 'ogg';if(mimeType.includes('webm'))return 'webm';return 'audio';}
async function readApiResponse(response){const raw=await response.text();if(!raw.trim())throw new Error('Voice processing returned an empty response.');let data;try{data=JSON.parse(raw);}catch{throw new Error('Voice processing returned an invalid response.');}if(!response.ok){const message=String(data.error||'').toLowerCase();if(message.includes('gemini_api_key')||message.includes('gemini_model'))throw new Error('Voice processing is not configured. Contact your application administrator.');if(message.includes('too short'))throw new Error('The audio is too short to process. Record a longer clip and retry.');if(message.includes('unsupported audio'))throw new Error('This audio format is not supported. Record another clip and retry.');throw new Error('Voice processing failed. Your saved recording is available to retry.');}return data;}
export default function App(){
 const [form,setForm]=useState(EMPTY),[activeRecordingId,setActiveRecordingId]=useState(null),[transcript,setTranscript]=useState(''),[notice,setNotice]=useState(''),[recordingError,setRecordingError]=useState(''),[drawerOpen,setDrawerOpen]=useState(false),[drawerDetailId,setDrawerDetailId]=useState(null),[unsavedRecording,setUnsavedRecording]=useState(null),[processingIds,setProcessingIds]=useState([]),[transcribingIds,setTranscribingIds]=useState([]),[savingTranscriptIds,setSavingTranscriptIds]=useState([]),[deletingIds,setDeletingIds]=useState([]),[transcriptDrafts,setTranscriptDrafts]=useState({}),[suggestionEdits,setSuggestionEdits]=useState({}),[rejectedSuggestions,setRejectedSuggestions]=useState({});
 const activeSessionRef=useRef(null);
 const activeRecordingIdRef=useRef(null);
 const operationLocksRef=useRef(new Set());
 const transcriptSaveLocksRef=useRef(new Set());
 const requestControllersRef=useRef(new Map());
 const invalidatedRecordingIdsRef=useRef(new Set());
 const {isRecording,isPaused,isStarting,isFinalizing,elapsedMs,audioLevel,pauseSupported,start,pause,resume,stop,cancel}=useVoiceRecorder();
 const {recordings,recordingsLoading,storageError,saveRecording,updateRecording,updateIfTranscriptMatches,deleteRecording}=useRecordingHistory();
 const update=(key,value)=>setForm(previous=>({...previous,[key]:value,...(key==='bankName'?{branchName:''}:{})}));
 const activateRecording=id=>{activeRecordingIdRef.current=id;setActiveRecordingId(id);};
 const selectedRecording=recordings.find(item=>item.id===activeRecordingId)||(unsavedRecording?.id===activeRecordingId?unsavedRecording:null);
 const selectedTranscript=selectedRecording?getWorkingTranscript(selectedRecording):'';
 const transcriptDraftIsDirty=Boolean(selectedRecording&&Object.hasOwn(transcriptDrafts,selectedRecording.id)&&transcriptDrafts[selectedRecording.id]!==selectedTranscript);
 const extractionMatches=Boolean(selectedRecording&&selectedRecording.extractedFields&&Object.keys(selectedRecording.extractedFields).length&&selectedRecording.extractionTranscriptSnapshot===selectedTranscript&&!selectedRecording.extractionStale);
 const currentDraft=extractionMatches&&!transcriptDraftIsDirty&&selectedRecording.status!=='applied'?selectedRecording.extractedFields:null;
 const currentUnmatched=selectedRecording&&selectedRecording.extractionTranscriptSnapshot===selectedTranscript&&!selectedRecording.extractionStale&&!transcriptDraftIsDirty?selectedRecording.unmatchedFields||{}:{};
 const rejectedForActive=new Set(rejectedSuggestions[activeRecordingId]||[]);
 const pendingSuggestionKeys=Object.keys(currentDraft||{}).filter(key=>!rejectedForActive.has(key));
 const reviewableSuggestions=pendingSuggestionKeys.length>0||Object.keys(currentUnmatched).length>0;
 const requiredKeys=['entityName','entityType','services','bankName','assignedBy','date'];
 const missingRequiredFields=requiredKeys.filter(key=>!form[key]);
 const setIdBusy=(setter,id,active)=>setter(current=>active?current.includes(id)?current:[...current,id]:current.filter(item=>item!==id));
 const finalizeRecording=async result=>{
  const session=activeSessionRef.current;if(!session||session.id!==result.recordingId)return;
  const tooShort=result.audioBlob.size<1500;const error=result.error?safeVoiceError(new Error(result.error)):(tooShort?'Recording is very short and may not be processable.':null);const noTranscript=session.mode==='browser'&&!session.transcript.trim();
  const recording={id:session.id,requestDraftId:DEMO_DRAFT_ID,createdAt:session.createdAt,updatedAt:result.stoppedAt,recordedBy:{id:'demo-user',name:'Demo User',demoOnly:true},durationMs:result.durationMs,mimeType:result.mimeType,audioBlob:result.audioBlob,transcript:session.transcript,originalTranscript:session.transcript,correctedTranscript:session.transcript,activeTranscriptSource:session.mode==='browser'?'browser':'gemini-audio',transcriptEdited:false,transcriptUpdatedAt:null,geminiTranscript:null,extractedFields:{},extractionSource:null,extractionTranscriptSnapshot:null,extractionStale:false,transcriptionStatus:'idle',transcriptionError:null,extractionError:null,status:error?'error':'recorded',appliedAt:null,error};
  activeSessionRef.current=null;setTranscript(recording.transcript);
  try{
   const saved=await saveRecording(recording);setUnsavedRecording(null);setRecordingError(error||'');
   if(error){setNotice('The audio was saved, but it is too short to process.');return;}
   setNotice(noTranscript?'No browser transcript was available. Trying Gemini Audio…':'Voice input processed. Review the suggested details before submitting.');
   void processSavedRecording(saved);
  }catch(saveError){setUnsavedRecording(recording);setRecordingError(safeVoiceError(saveError));}
 };
 const startRecording=async()=>{
    if(isRecording||isFinalizing||activeSessionRef.current||unsavedRecording)return;
      setNotice('');setRecordingError('');setTranscript('');
  const session={id:createRecordingId(),mode:'browser',createdAt:new Date().toISOString(),transcript:''};activeSessionRef.current=session;activateRecording(session.id);
  try{const started=await start({recordingId:session.id,mode:session.mode,onTranscript:value=>{if(activeSessionRef.current?.id!==session.id)return;session.transcript=value;setTranscript(value);},onNotice:message=>{if(activeSessionRef.current?.id===session.id)setRecordingError(safeVoiceError(new Error(message)));},onComplete:finalizeRecording});if(!started&&activeSessionRef.current?.id===session.id){activeSessionRef.current=null;activateRecording(null);}}
  catch(error){if(activeSessionRef.current?.id===session.id)activeSessionRef.current=null;activateRecording(null);setRecordingError(safeVoiceError(error));}
 };
 const stopRecording=()=>{if(!isRecording||isFinalizing)return;setNotice('Finalizing audio…');stop();};
 const cancelRecording=async()=>{const session=activeSessionRef.current;if(!session)return;await cancel();if(activeSessionRef.current?.id===session.id)activeSessionRef.current=null;activateRecording(null);setTranscript('');setNotice('Recording canceled. Previous recordings are unchanged.');setRecordingError('');};
 const selectRecording=recording=>{activateRecording(recording.id);setTranscript(getWorkingTranscript(recording));setNotice('');};
 const retrySave=async()=>{if(!unsavedRecording)return;try{const saved=await saveRecording(unsavedRecording);setUnsavedRecording(null);setRecordingError('');setNotice('Recording saved. Processing voice input…');if(saved.status!=='error')void processSavedRecording(saved);}catch(error){setRecordingError(safeVoiceError(error));}};
 const saveTranscriptForRecording=async(recording,value,source)=>{
  if(transcriptSaveLocksRef.current.has(recording.id))throw new Error('Transcript saving is already in progress.');
  transcriptSaveLocksRef.current.add(recording.id);
  setIdBusy(setSavingTranscriptIds,recording.id,true);
  try{
   activateRecording(recording.id);
   const original=recording.originalTranscript??recording.transcript??'';
   const selectedSource=source||(value===original?(recording.transcriptSource==='gemini-audio'?'gemini-audio':'browser'):'user-corrected');
   const updates=createTranscriptSelection(recording,value,selectedSource);
   const saved=await updateRecording(recording.id,updates);
  setTranscriptDrafts(current=>{const next={...current};delete next[recording.id];return next;});
  if(activeRecordingIdRef.current===recording.id)setTranscript(getWorkingTranscript(saved));
   return saved;
  }finally{transcriptSaveLocksRef.current.delete(recording.id);setIdBusy(setSavingTranscriptIds,recording.id,false);}
 };
 const processTranscript=async(recording,value)=>{
  const submittedTranscript=String(value??'');
  if(!submittedTranscript.trim()){setNotice('Corrected transcript is empty. Add or select transcript text before processing.');return false;}
  if(operationLocksRef.current.has(recording.id))return false;
  operationLocksRef.current.add(recording.id);activateRecording(recording.id);
  invalidatedRecordingIdsRef.current.delete(recording.id);
  const controller=new AbortController();requestControllersRef.current.set(recording.id,controller);
  setIdBusy(setProcessingIds,recording.id,true);
  try{
   await updateRecording(recording.id,{extractionError:null});
   const response=await fetch('/api/extract.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript:submittedTranscript,allowedOptions:GEMINI_OPTIONS,existing:form}),signal:controller.signal});
   const data=await readApiResponse(response);
  const extractedFields=normalize(data.fields||{},form);const unmatchedFields=normalizeUnmatched(data.unmatchedFields);
  const updated=await updateIfTranscriptMatches(recording.id,submittedTranscript,{status:'processed',extractedFields,unmatchedFields,extractionSource:'gemini-text',extractionTranscriptSnapshot:submittedTranscript,extractionStale:false,extractionError:null,appliedAt:null,error:null});
  if(!updated){if(activeRecordingIdRef.current===recording.id)setNotice('Transcript changed while Gemini was processing. The older response was not saved; process the latest transcript.');return false;}
  setTranscript(submittedTranscript);
  if(activeRecordingIdRef.current===recording.id){setDrawerOpen(false);setRecordingError('');setNotice(Object.keys(extractedFields).length?'Voice input processed. Review the suggested details before submitting.':Object.keys(unmatchedFields).length?'Some values need verification and were not applied to dropdowns.':'No form suggestions were found. The recording and transcript were retained.');}
   return true;
  }catch(error){if(invalidatedRecordingIdsRef.current.has(recording.id)||error.name==='AbortError')return false;const message=safeVoiceError(error);try{await updateRecording(recording.id,{extractionError:message});}catch{if(activeRecordingIdRef.current===recording.id)setRecordingError(`${message} The error state could not be saved.`);return false;}if(activeRecordingIdRef.current===recording.id)setRecordingError(message);return false;}
  finally{if(requestControllersRef.current.get(recording.id)===controller)requestControllersRef.current.delete(recording.id);operationLocksRef.current.delete(recording.id);setIdBusy(setProcessingIds,recording.id,false);}
 };
 const retryAudioTranscription=async(recording,{activateEmptyTranscript=false}={})=>{
  if(operationLocksRef.current.has(recording.id))return;
  operationLocksRef.current.add(recording.id);activateRecording(recording.id);
  invalidatedRecordingIdsRef.current.delete(recording.id);
  const controller=new AbortController();requestControllersRef.current.set(recording.id,controller);
  setIdBusy(setTranscribingIds,recording.id,true);
  try{
   const audioBlob=recording.audioBlob;
   if(!(audioBlob instanceof Blob)||audioBlob.size<1500)throw new Error('No usable saved audio is available. Record a longer clip and try again.');
   if(audioBlob.size>8*1024*1024)throw new Error('Audio exceeds the 8 MB upload limit.');
   const mimeType=(recording.mimeType||audioBlob.type||'').split(';')[0];
   if(!['audio/webm','video/webm','audio/mp4','video/mp4','audio/ogg','application/ogg'].includes(mimeType))throw new Error(`Unsupported saved audio format: ${mimeType||'unknown'}.`);
   await updateRecording(recording.id,{transcriptionStatus:'processing',transcriptionError:null});
   const body=new FormData();body.append('audio',audioBlob,`recording.${audioExtension(recording.mimeType||audioBlob.type)}`);body.append('allowedOptions',JSON.stringify(GEMINI_OPTIONS));body.append('existing',JSON.stringify(form));
  const response=await fetch('/api/audio.php',{method:'POST',body,signal:controller.signal});
   const data=await readApiResponse(response);
   if(typeof data.transcript!=='string'||!data.transcript.trim())throw new Error('Gemini did not return a transcript for this audio.');
  const extractedFields=normalize(data.fields||{},form);const unmatchedFields=normalizeUnmatched(data.unmatchedFields);
   const updates={geminiTranscript:data.transcript,transcriptionStatus:'completed',transcriptionError:null};
  const useFallbackTranscript=activateEmptyTranscript&&!getWorkingTranscript(recording).trim();
  if(useFallbackTranscript){updates.correctedTranscript=data.transcript;updates.transcript=data.transcript;updates.activeTranscriptSource='gemini-audio';updates.transcriptEdited=false;updates.transcriptUpdatedAt=null;}
  if(Object.keys(extractedFields).length||Object.keys(unmatchedFields).length||useFallbackTranscript){updates.extractedFields=extractedFields;updates.unmatchedFields=unmatchedFields;updates.extractionSource='gemini-audio';updates.extractionTranscriptSnapshot=data.transcript;updates.extractionStale=false;updates.extractionError=null;updates.status='processed';updates.appliedAt=null;}
   await updateRecording(recording.id,updates);
  setRecordingError('');
  if(useFallbackTranscript){setTranscript(data.transcript);if(activeRecordingIdRef.current===recording.id)setNotice(Object.keys(extractedFields).length?'Voice input processed. Review the suggested details before submitting.':'Audio transcribed, but no form suggestions were found.');}
  else if(activeRecordingIdRef.current===recording.id)setNotice('Gemini transcript saved for comparison. Choose a transcript explicitly before using its extraction.');
  }catch(error){if(invalidatedRecordingIdsRef.current.has(recording.id)||error.name==='AbortError')return;const message=safeVoiceError(error);try{await updateRecording(recording.id,{transcriptionStatus:'error',transcriptionError:message});}catch{if(activeRecordingIdRef.current===recording.id)setRecordingError(`${message} The error state could not be saved.`);return;}if(activeRecordingIdRef.current===recording.id)setRecordingError(message);}
  finally{if(requestControllersRef.current.get(recording.id)===controller)requestControllersRef.current.delete(recording.id);operationLocksRef.current.delete(recording.id);setIdBusy(setTranscribingIds,recording.id,false);}
 };
 const processSavedRecording=recording=>getWorkingTranscript(recording).trim()?processTranscript(recording,getWorkingTranscript(recording)):retryAudioTranscription(recording,{activateEmptyTranscript:true});
 const chooseTranscript=async(recording,value,source)=>{const saved=await saveTranscriptForRecording(recording,value,source);setNotice(saved.extractionStale?'Transcript selected. Reprocess before confirming the older suggestions.':Object.keys(saved.extractedFields||{}).length?'Transcript selected. Review the matching suggestions before confirming.':'Transcript selected for future processing.');return saved;};
 const saveAndReprocess=async(recording,value)=>{const saved=await saveTranscriptForRecording(recording,value,'user-corrected');const processed=await processTranscript(saved,value);if(!processed)throw new Error('Transcript saved, but processing did not complete. You can retry from this recording.');return saved;};
 const retryTextExtraction=recording=>processTranscript(recording,getWorkingTranscript(recording));
 const retryVoiceWork=()=>{if(!selectedRecording)return;if(selectedRecording.transcriptionStatus==='error')retryAudioTranscription(selectedRecording);else processTranscript(selectedRecording,selectedTranscript);};
 const updateSuggestion=(key,value)=>setSuggestionEdits(current=>({...current,[activeRecordingId]:{...(current[activeRecordingId]||{}),[key]:value}}));
 const rejectSuggestion=key=>setRejectedSuggestions(current=>({...current,[activeRecordingId]:[...new Set([...(current[activeRecordingId]||[]),key])]}));
 const confirmSuggestedValues=async()=>{
  if(!currentDraft||!activeRecordingId)return;
  const rejected=new Set(rejectedSuggestions[activeRecordingId]||[]);
  const edits=suggestionEdits[activeRecordingId]||{};
  const reviewed=Object.fromEntries(Object.entries(currentDraft).filter(([key])=>!rejected.has(key)).map(([key,value])=>[key,edits[key]??value]));
  const fields=normalize(reviewed,form);
  if(!Object.keys(fields).length){setNotice('No valid suggestions remain to confirm.');return;}
  setForm(previous=>{const next={...previous,...fields};if(fields.bankName&&fields.bankName!==previous.bankName&&!fields.branchName)next.branchName='';return next;});
  setNotice('Suggested values confirmed. Check the form before submitting.');
  try{
   await updateRecording(activeRecordingId,{status:'applied',appliedAt:new Date().toISOString(),error:null});
   setSuggestionEdits(current=>{const next={...current};delete next[activeRecordingId];return next;});
   setRejectedSuggestions(current=>{const next={...current};delete next[activeRecordingId];return next;});
  }catch(error){setRecordingError(`Values were confirmed, but the recording status could not be saved: ${error.message}`);}
 };
 const deleteRecordingFromHistory=async recording=>{
  const id=recording.id;
  setIdBusy(setDeletingIds,id,true);
  invalidatedRecordingIdsRef.current.add(id);
  requestControllersRef.current.get(id)?.abort();
  try{
   await deleteRecording(id);
   operationLocksRef.current.delete(id);
   if(activeRecordingIdRef.current===id){activateRecording(null);setTranscript('');}
   setSuggestionEdits(current=>{const next={...current};delete next[id];return next;});
   setRejectedSuggestions(current=>{const next={...current};delete next[id];return next;});
   setTranscriptDrafts(current=>{const next={...current};delete next[id];return next;});
   setNotice('Recording deleted. Previously confirmed form values remain unchanged.');
  }catch(error){invalidatedRecordingIdsRef.current.delete(id);const message=safeVoiceError(error);setRecordingError(message);throw new Error(message);}
  finally{setIdBusy(setDeletingIds,id,false);}
 };
 const reset=()=>{if(unsavedRecording){setNotice('Retry saving the current recording before clearing the form.');return;}setForm(EMPTY);activateRecording(null);setTranscript('');setNotice('Form cleared. Saved recordings and their results are unchanged.');};
 const submit=e=>{e.preventDefault();if(missingRequiredFields.length){setNotice(`Required fields still missing: ${missingRequiredFields.map(key=>LABELS[key]).join(', ')}`);return;}setNotice('Form validated successfully. Demo only: connect this action to your PHP save endpoint.');};
 const suggestionControl=key=>{
  if(!currentDraft?.[key]||(rejectedSuggestions[activeRecordingId]||[]).includes(key))return null;
  const value=suggestionEdits[activeRecordingId]?.[key]??currentDraft[key];
  const bank=suggestionEdits[activeRecordingId]?.bankName||currentDraft.bankName||form.bankName;
  const options=OPTIONS[key]||(key==='branchName'?BRANCHES[bank]||[]:null);
  return <div className="field-suggestion"><div className="suggestion-caption"><span>From voice</span><span>Review before confirming</span></div>{options?<select className="field suggestion-value" aria-label={`${LABELS[key]} voice suggestion`} value={value} onChange={event=>updateSuggestion(key,event.target.value)}>{options.map(option=><option key={option} value={option}>{option}</option>)}</select>:<input className="field suggestion-value" type={key==='date'?'date':'text'} aria-label={`${LABELS[key]} voice suggestion`} value={value} onChange={event=>updateSuggestion(key,event.target.value)}/>}<button type="button" className="suggestion-reject" aria-label={`Reject ${LABELS[key]} suggestion`} onClick={()=>rejectSuggestion(key)}><X size={14}/></button></div>;
 };
 const unmatchedControl=key=>currentUnmatched[key]&&<div className="field-unmatched"><span>Needs verification · not applied</span><strong>{currentUnmatched[key]}</strong></div>;
 const input=(key,placeholder)=><><input className="field" placeholder={placeholder} value={form[key]} onChange={event=>update(key,event.target.value)}/>{suggestionControl(key)}{unmatchedControl(key)}</>;
 const select=(key,placeholder,values,disabled=false)=><><select className="field" value={form[key]} disabled={disabled} onChange={event=>update(key,event.target.value)}><option value="">{placeholder}</option>{values.map(value=><option key={value} value={value}>{value}</option>)}</select>{suggestionControl(key)}{unmatchedControl(key)}</>;
 const displayedTranscript=selectedRecording?selectedTranscript:transcript;
 const processing=processingIds.includes(activeRecordingId);
 const transcribing=transcribingIds.includes(activeRecordingId);
 const safeStorageError=storageError?safeVoiceError(new Error(storageError)):'';
 const openHistory=()=>{setDrawerDetailId(null);setDrawerOpen(true);};
 const openTranscript=()=>{if(!activeRecordingId)return;setDrawerDetailId(activeRecordingId);setDrawerOpen(true);};
 return (
  <div className="min-h-screen md:flex">
   <aside className="md:w-[230px] bg-[#11264b] text-white px-5 py-6 shrink-0">
    <div className="font-extrabold text-lg mb-5">◇ Fintech Portal</div>
    <p className="text-xs leading-5 text-slate-300 mb-10">Account Opening<br/>Management Platform</p>
    <nav className="space-y-2 text-sm">
     <div className="rounded-lg bg-[#385783] p-3 flex gap-2 items-center"><FilePlus2 size={15}/> Add New Request</div>
     <div className="p-3 flex gap-2 items-center text-slate-300"><ClipboardList size={15}/> Requests</div>
     <div className="p-3 flex gap-2 items-center text-slate-300"><Settings size={15}/> Settings</div>
    </nav>
   </aside>
   <main className="flex-1 min-w-0">
    <header className="bg-[#e6efff] px-6 md:px-10 py-5 flex justify-between items-center">
     <div><h1 className="font-bold text-xl">Add New Request</h1><p className="mini">Entity, bank and assignment details</p></div>
     <span className="text-xs rounded-full border border-blue-100 bg-white/70 px-3 py-2 flex gap-1 items-center"><ShieldCheck size={14}/> External Access</span>
    </header>
    <form onSubmit={submit} className="max-w-[1040px] mx-auto px-4 md:px-8 py-5 md:py-7 space-y-4">
     <VoiceCapturePanel
      isRecording={isRecording}
      isPaused={isPaused}
      isStarting={isStarting}
      isFinalizing={isFinalizing}
      pauseSupported={pauseSupported}
      elapsedMs={elapsedMs}
      audioLevel={audioLevel}
      processing={processing}
      transcribing={transcribing}
      transcript={displayedTranscript}
      status={reviewableSuggestions?'':notice}
      error={recordingError}
      retryLabel={selectedRecording?.transcriptionStatus==='error'?'Retry Transcription':'Retry Processing'}
      recordingCount={recordings.length}
      onStart={startRecording}
      onPause={pause}
      onResume={resume}
      onStopAndProcess={stopRecording}
      onCancel={cancelRecording}
      onOpenHistory={openHistory}
      onRetryTranscription={selectedRecording?retryVoiceWork:null}
     />
     {reviewableSuggestions&&(
      <section className="voice-review-banner" role="status">
      <div><strong>Voice input processed. Review the suggested details before submitting.</strong><p className="mini">Suggestions are not confirmed until you accept them.</p>{['entityName','entityType','services','bankName','assignedBy','date'].some(key=>!form[key])&&<p className="missing-fields-note">Required fields still missing: {['entityName','entityType','services','bankName','assignedBy','date'].filter(key=>!form[key]).map(key=>LABELS[key]).join(', ')}</p>}</div>
        <div><strong>Voice input processed. Review the suggested details before submitting.</strong><p className="mini">Suggestions are not confirmed until you accept them.</p>{missingRequiredFields.length>0&&<p className="missing-fields-note">Required fields still missing: {missingRequiredFields.map(key=>LABELS[key]).join(', ')}</p>}</div>
        {!reviewableSuggestions&&missingRequiredFields.length>0&&<p className="missing-fields-note form-missing-note">Required fields still missing: {missingRequiredFields.map(key=>LABELS[key]).join(', ')}</p>}
       <div className="voice-review-actions">
        <button type="button" className="action secondary" disabled={!activeRecordingId} onClick={openTranscript}>View Transcript</button>
        <button type="button" className="action secondary" disabled={isRecording||isFinalizing} onClick={startRecording}>Record Again / Add Another Recording</button>
        <button type="button" className="action primary" disabled={!pendingSuggestionKeys.length} onClick={confirmSuggestedValues}>Confirm Suggested Values ({pendingSuggestionKeys.length})</button>
       </div>
      </section>
     )}
    {storageError&&<p className="recording-storage-error" role="alert">{safeStorageError}</p>}
     {unsavedRecording?.id===activeRecordingId&&<div className="unsaved-recording" role="alert">This recording is available only in the current page because IndexedDB saving failed.<button type="button" className="action secondary" onClick={retrySave}>Retry save</button></div>}
     <Section num="1" title="Entity Information">
      <Field label="Entity Name" required>{input('entityName','Enter entity name')}</Field>
      <Field label="Entity Type" required>{select('entityType','Select entity type',OPTIONS.entityType)}</Field>
      <Field label="TSP">{input('tsp','Enter TSP')}</Field>
      <Field label="Services" required>{input('services','Enter services')}</Field>
     </Section>
     <Section num="2" title="Bank Information">
      <Field label="Bank Name" required>{select('bankName','Select bank',OPTIONS.bankName)}</Field>
      <Field label="Branch Name">{select('branchName',form.bankName?'Select branch':'Select a bank first',BRANCHES[form.bankName]||[],!form.bankName)}<p className="mini mt-2">Branch options load once a bank is selected.</p></Field>
     </Section>
     <Section num="3" title="Assignment Information">
      <Field label="Task Assigned By" required>{select('assignedBy','Select assigned by',OPTIONS.assignedBy)}</Field>
      <Field label="Date" required><input type="date" className="field" value={form.date} onChange={event=>update('date',event.target.value)}/>{suggestionControl('date')}{unmatchedControl('date')}</Field>
     </Section>
     <div className="flex justify-end gap-2 pt-2">
      <button type="button" disabled={Boolean(unsavedRecording)} onClick={reset} className="action secondary">Clear Form</button>
      <button type="submit" className="action primary">Submit Request</button>
     </div>
    </form>
   </main>
   <RecordingHistoryDrawer
    open={drawerOpen}
    initialDetailId={drawerDetailId}
    recordings={recordings}
    recordingsLoading={recordingsLoading}
    storageError={safeStorageError}
    activeRecordingId={activeRecordingId}
    processingIds={processingIds}
    transcribingIds={transcribingIds}
    deletingIds={deletingIds}
    onDraftChange={(id,value)=>setTranscriptDrafts(current=>({...current,[id]:value}))}
    onSelect={selectRecording}
    onSaveAndReprocess={saveAndReprocess}
    onRetryTextExtraction={retryTextExtraction}
    onRetryAudioTranscription={retryAudioTranscription}
    onChooseTranscript={chooseTranscript}
    onConfirm={confirmSuggestedValues}
    onDelete={deleteRecordingFromHistory}
    onClose={()=>setDrawerOpen(false)}
   />
  </div>
 );
}
