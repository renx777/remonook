import {TypingWordmark} from './TypingWordmark';
import {RemoLogo} from './RemoLogo';
import {useState} from 'react';
import {Icon} from './icons';
import {SocialIcon} from './SocialIcon';
import './landing.css';
export function Landing({onSignIn,signedIn=false}:{onSignIn:()=>Promise<void>;signedIn?:boolean}){
 const [view,setView]=useState<'notes'|'study'>('notes'),[revealed,setRevealed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const signIn=async()=>{if(busy)return;setBusy(true);setError('');try{await onSignIn();}catch(e){const code=(e as {code?:string}).code;setError(code==='auth/popup-closed-by-user'?'Sign-in was closed. You can try again or explore as a guest.':code==='auth/popup-blocked'?'Allow the sign-in popup, or explore as a guest.':'Could not sign in. Please try again, or explore as a guest.');}finally{setBusy(false);}};
 const accountButton=(label:string)=>signedIn?<a className="landing-primary" href="#app">Open your workspace <Icon name="forward" size={16}/></a>:<button className="landing-primary" disabled={busy} onClick={()=>void signIn()}><span className="landing-google" aria-hidden="true">G</span>{busy?'Opening Google…':label}<Icon name="forward" size={16}/></button>;
 return <div className="landing">
  <a className="landing-skip" href="#landing-content">Skip to content</a>
  <div className="landing-wrap">
   <header className="landing-header"><a className="landing-brand" href="#home" aria-label="RemoNook home"><RemoLogo/><TypingWordmark/><span className="landing-beta">BETA</span></a><nav aria-label="Welcome navigation"><a href="#how-it-works">A look inside</a>{signedIn?<a href="#app">Your workspace <Icon name="forward" size={14}/></a>:<button disabled={busy} onClick={()=>void signIn()}>Sign in <Icon name="forward" size={14}/></button>}</nav></header>
   <main id="landing-content">
    <section className="landing-hero" aria-labelledby="landing-title">
     <div className="landing-intro"><p className="landing-eyebrow"><span/>A quieter kind of workspace</p><h1 id="landing-title">A space to think.<br/>A way to <span className="landing-hero-word"><span className="landing-brand-blue">Re</span>member</span> <span className="landing-hero-word"><span className="landing-brand-blue">Mo</span>re.</span></h1><p className="landing-description">Capture a thought, follow its branches, and turn the things you learn into flashcards. One calm workspace for ideas worth remembering.</p><div className="landing-entry">{accountButton('Get started with Google')}<a className="landing-guest" data-guest-entry href="#app">Try as a guest <Icon name="forward" size={16}/></a></div><p className="landing-entry-note">No account needed to explore.<br/>Guest notes stay in this browser.</p><div className="landing-flow" aria-label="Capture, organize, remember"><span><strong>01</strong> Capture</span><span className="landing-flow-arrow" aria-hidden="true">→</span><span><strong>02</strong> Organize</span><span className="landing-flow-arrow" aria-hidden="true">→</span><span><strong>03</strong> Remember</span></div>{error&&<p className="landing-error" role="alert">{error}</p>}</div>
     <div className="landing-preview" id="how-it-works" role="region" aria-label="Interactive notes and flashcards preview">
      <div className="landing-preview-bar"><span><span className="landing-preview-dot"/>A thought, taking shape</span><div role="group" aria-label="Interactive preview"><button aria-pressed={view==='notes'} onClick={()=>setView('notes')}>Notes</button><button aria-pressed={view==='study'} onClick={()=>setView('study')}>Flashcard</button></div></div>
      <div className="landing-preview-body">
       {view==='notes'?<div className="landing-demo-outline"><p className="landing-demo-label">YOUR IDEAS, CONNECTED</p><div className="landing-demo-root"><span className="landing-bullet landing-parent"/><strong>Machine Learning</strong><span className="landing-demo-tag">#learning</span></div><div className="landing-demo-branch"><div className="landing-demo-topic"><span className="landing-bullet"/>Foundations</div><div className="landing-demo-question"><span className="landing-bullet"/>How does a model learn?<span className="landing-question-tag">Q</span></div><div className="landing-demo-answer"><span className="landing-bullet"/>By finding patterns in examples.</div><div className="landing-demo-topic landing-next-topic"><span className="landing-bullet"/>Ideas to explore</div><div className="landing-demo-faint"><span className="landing-bullet"/>One thought leads to another<span className="landing-demo-caret"/></div></div><button className="landing-preview-link" onClick={()=>{setView('study');setRevealed(false);}}>Now, make it stick <Icon name="forward" size={14}/></button></div>:<div className="landing-demo-study"><div className="landing-demo-label"><span>FOUNDATIONS</span><span>FLASHCARD PREVIEW</span></div><h2>How does a model learn?</h2><div className={`landing-demo-reveal ${revealed?'is-revealed':''}`}>{revealed?<p>By finding patterns in examples.</p>:<p>A little recall goes a long way.</p>}</div><button className="landing-demo-reveal-button" onClick={()=>setRevealed(!revealed)}>{revealed?'Try again':'Reveal answer'}<Icon name={revealed?'renewal':'forward'} size={15}/></button></div>}
      </div>
      <div className="landing-preview-foot"><span><Icon name="notes" size={13}/>From a note to something you know.</span><span>Interactive preview</span></div>
     </div>
    </section>
    <section className="landing-features" aria-label="What you can do in RemoNook">
     <div><span className="landing-feature-number">01 / CAPTURE</span><h2>Follow the thread.</h2><p>Nested notes, tags and linked ideas. Room for the big picture and every small detail.</p></div>
     <div><span className="landing-feature-number">02 / REVIEW</span><h2>Learn from your own notes.</h2><p>Make flashcards, quizzes, and image occlusion cards from your notes. Review with spaced repetition or at your own pace.</p></div>
     <div><span className="landing-feature-number">03 / OWN</span><h2>Pick up where you left off.</h2><p>Keep writing when you’re offline. Sign in to sync, export a backup, or save a copy to a folder you choose.</p></div>
    </section>
    <section className="landing-closing"><div><p className="landing-eyebrow">A place for your next thought.</p><h2>Start small. See where it goes.</h2></div><a className="landing-guest" href="#app">Explore RemoNook <Icon name="forward" size={18}/></a></section>
   </main>
   <footer className="landing-footer">
    <a className="landing-brand landing-footer-brand" href="#home" aria-label="RemoNook home"><RemoLogo/>RemoNook<span className="landing-footer-dot">.</span></a>
    <span className="landing-footer-note">Notes. Connections. A little more clarity.</span>
    <nav className="landing-footer-social" aria-label="Follow RemoNook">
      <a className="landing-social-link" href="https://www.instagram.com/remonook.hq/" target="_blank" rel="noopener noreferrer" aria-label="RemoNook on Instagram, @RemoNook.hq"><span className="landing-social-mark"><SocialIcon network="instagram"/></span><span className="landing-social-copy"><strong>Instagram</strong><small>@RemoNook.hq</small></span></a>
      <a className="landing-social-link" href="https://x.com/RemoNookhq" target="_blank" rel="noopener noreferrer" aria-label="RemoNook on X, @RemoNookhq"><span className="landing-social-mark"><SocialIcon network="x"/></span><span className="landing-social-copy"><strong>X</strong><small>@RemoNookhq</small></span></a>
      <a className="landing-social-link" href="https://www.youtube.com/@RemoNook" target="_blank" rel="noopener noreferrer" aria-label="RemoNook on YouTube, @RemoNook"><span className="landing-social-mark"><SocialIcon network="youtube"/></span><span className="landing-social-copy"><strong>YouTube</strong><small>@RemoNook</small></span></a>
    </nav>
    <a className="landing-footer-app" href="#app">Open the app <Icon name="forward" size={13}/></a>
   </footer>
  </div>
 </div>;
}
