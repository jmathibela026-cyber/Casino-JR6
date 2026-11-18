import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import {
  addSpin, addSpins, analyzeDistributions, analyzePatterns, clearHistory,
  column, currentSessionId, deleteSpin, dozen, listSpins, makeSpinDraft,
  parseHistoricalCsv, parity, pocketColor, pocketLabel, securePocket,
  serializeCsv, updateSpin,
} from './data';
import type { Spin, SpinSource, StatDistribution } from './types';

type NoticeKind = 'info' | 'success' | 'error';
type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; length: number; [index: number]: RecognitionAlternative };
type RecognitionEvent = Event & { resultIndex: number; results: { length: number; [index: number]: RecognitionResult } };
type RecognitionErrorEvent = Event & { error?: string };
interface BrowserRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionConstructor = new () => BrowserRecognition;

type IconName = 'activity' | 'arrow-up-right' | 'bell' | 'check' | 'chevron-down' | 'download' | 'edit' | 'file-up' | 'mic' | 'play' | 'plus' | 'refresh' | 'screen' | 'shield' | 'speaker' | 'stop' | 'trash' | 'x' | 'spark';
const iconPaths: Record<IconName, ReactNode> = {
  activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /><path d="M21 12h-1" /></>,
  'arrow-up-right': <><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  'chevron-down': <path d="m7 10 5 5 5-5" />,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
  'file-up': <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M12 18v-6m-3 3 3-3 3 3" /></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>,
  play: <path d="m8 5 12 7-12 7z" />,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.55-2.6L20 12M4 12l2.85 5.6A7 7 0 0 0 18.4 15" /></>,
  screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  speaker: <><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6" /><path d="M10 11v5m4-5v5" /></>,
  x: <><path d="m18 6-12 12M6 6l12 12" /></>,
  spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z" /></>,
};

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

function parseSpokenPocket(text: string): number | null {
  const lower = text.toLowerCase();
  const digit = lower.match(/\b(?:3[0-6]|[12]?\d)\b/);
  if (digit) return Number(digit[0]);

  const wordValues: Record<string, number> = {
    zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30,
  };
  const words = lower.match(/\b(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty)\b/g) ?? [];
  for (let i = 0; i < words.length; i += 1) {
    const value = wordValues[words[i]];
    if ((value === 20 || value === 30) && i + 1 < words.length && wordValues[words[i + 1]] > 0 && wordValues[words[i + 1]] < 10) {
      const combined = value + wordValues[words[i + 1]];
      return combined <= 36 ? combined : null;
    }
    if (value >= 0 && value <= 36) return value;
  }
  return null;
}

function sourceName(source: SpinSource): string {
  return source === 'voice' ? 'Voice' : source === 'generated' ? 'Generated' : source === 'imported' ? 'Imported' : 'Manual';
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function pocketTone(pocket: number): string {
  return pocketColor(pocket) === 'red' ? 'tone-red' : pocketColor(pocket) === 'black' ? 'tone-black' : 'tone-green';
}

function BrandMark() {
  return <div className="brand-mark" aria-hidden="true"><span /><span /><span /><i /></div>;
}

function DistributionCard({ distribution }: { distribution: StatDistribution }) {
  const maxValue = Math.max(...distribution.rows.map((row) => row.count), 1);
  return (
    <article className="analysis-card">
      <div className="analysis-card-head">
        <div><p className="eyebrow">{distribution.name === 'Pocket' ? '01 / ALL OUTCOMES' : `0${['Color', 'Parity', 'Dozen', 'Column'].indexOf(distribution.name) + 2} / CATEGORY`}</p><h3>{distribution.name} distribution</h3></div>
        {distribution.eligible ? <span className={`test-chip ${distribution.chiSquare! > distribution.critical95! ? 'test-flag' : 'test-ok'}`}>{distribution.chiSquare! > distribution.critical95! ? 'FLAG' : 'WITHIN RANGE'}</span> : <span className="test-chip test-muted">MORE DATA</span>}
      </div>
      <div className={distribution.name === 'Pocket' ? 'pocket-frequency-grid' : 'category-list'}>
        {distribution.rows.map((row) => {
          const width = Math.max(row.count > 0 ? 3 : 0, (row.count / maxValue) * 100);
          const pocket = Number(row.label);
          const isPocket = distribution.name === 'Pocket';
          return isPocket ? (
            <div key={row.label} className={`frequency-cell ${pocketTone(pocket)}`} title={`Pocket ${row.label}: ${row.count} observed; expected ${row.expected.toFixed(1)}`}>
              <span className="frequency-number">{row.label.padStart(2, '0')}</span>
              <span className="frequency-bar"><i style={{ width: `${width}%` }} /></span>
              <span className="frequency-count">{row.count}</span>
            </div>
          ) : (
            <div key={row.label} className="category-row">
              <div className="category-label"><span>{row.label}</span><span>{row.count.toLocaleString()} <i>/ {row.expected.toFixed(0)} exp.</i></span></div>
              <div className="category-bar"><i style={{ width: `${width}%` }} /></div>
              <div className="category-meta"><span>{distribution.sampleSize ? `${(row.count / distribution.sampleSize * 100).toFixed(2)}% observed` : '0.00% observed'}</span><span>{(row.probability * 100).toFixed(2)}% expected</span></div>
            </div>
          );
        })}
      </div>
      <div className="chi-footnote">
        {distribution.eligible
          ? <>n={distribution.sampleSize.toLocaleString()} · χ² {distribution.chiSquare!.toFixed(2)} · df {distribution.degreesOfFreedom} · approx. 95% cutoff {distribution.critical95!.toFixed(2)}</>
          : <>n={distribution.sampleSize.toLocaleString()}; each expected bucket needs at least 5 for a reliable chi-square check.</>}
      </div>
    </article>
  );
}

function App() {
  const [spins, setSpins] = useState<Spin[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; kind: NoticeKind } | null>(null);
  const [lastPocket, setLastPocket] = useState<number | null>(null);
  const [manualPocket, setManualPocket] = useState('');
  const [pendingPocket, setPendingPocket] = useState<number | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState('');
  const [editTarget, setEditTarget] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [filter, setFilter] = useState('all');
  const [voiceOn, setVoiceOn] = useState(true);
  const [voiceActive, setVoiceActive] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSession = useMemo(() => currentSessionId(), []);

  const notify = useCallback((message: string, kind: NoticeKind = 'info') => {
    setNotice({ message, kind });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4600);
  }, []);

  const refreshHistory = useCallback(async () => {
    setSpins(await listSpins());
  }, []);

  useEffect(() => {
    refreshHistory().catch((error: unknown) => notify(error instanceof Error ? error.message : 'Could not load local history.', 'error'));
  }, [refreshHistory, notify]);

  useEffect(() => {
    if (videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [screenStream]);

  useEffect(() => () => {
    screenRef.current?.getTracks().forEach((track) => track.stop());
    recognitionRef.current?.stop();
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const sessions = useMemo(() => {
    const items = new Map<string, { newest: string; count: number; imported: boolean }>();
    for (const spin of spins) {
      const current = items.get(spin.sessionId);
      if (!current) items.set(spin.sessionId, { newest: spin.createdAt, count: 1, imported: spin.sessionId.startsWith('import-') });
      else { current.count += 1; if (spin.createdAt > current.newest) current.newest = spin.createdAt; }
    }
    return [...items.entries()].map(([id, meta]) => ({ id, ...meta })).sort((a, b) => b.newest.localeCompare(a.newest));
  }, [spins]);

  const filteredSpins = useMemo(() => {
    if (filter === 'session') return spins.filter((spin) => spin.sessionId === currentSession);
    if (filter === 'imported') return spins.filter((spin) => spin.source === 'imported');
    if (filter !== 'all') return spins.filter((spin) => spin.sessionId === filter);
    return spins;
  }, [spins, filter, currentSession]);

  const distributions = useMemo(() => analyzeDistributions(filteredSpins), [filteredSpins]);
  const patterns = useMemo(() => analyzePatterns(filteredSpins), [filteredSpins]);
  const pocketStats = distributions[0];
  const uniquePockets = pocketStats.rows.filter((row) => row.count > 0).length;
  const screenSupported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);

  const speakPocket = useCallback((pocket: number) => {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      notify('Speech readout is not available in this browser. You can still view every result on screen.', 'error');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`Pocket ${pocket}. ${pocketColor(pocket)}. ${parity(pocket)}.`);
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  }, [notify]);

  const recordPocket = useCallback(async (pocket: number, source: SpinSource, options?: { createdAt?: string; sessionId?: string; announce?: boolean }) => {
    setBusy(true);
    try {
      await addSpin(makeSpinDraft(pocket, source, options?.sessionId, options?.createdAt));
      await refreshHistory();
      setLastPocket(pocket);
      setManualPocket('');
      if (options?.announce ?? voiceOn) speakPocket(pocket);
      notify(`Pocket ${pocket} recorded as ${pocketColor(pocket)}.`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save this result.', 'error');
    } finally {
      setBusy(false);
    }
  }, [notify, refreshHistory, speakPocket, voiceOn]);

  const handleManualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (manualPocket === '') return notify('Select a pocket from 0 to 36 first.', 'error');
    void recordPocket(Number(manualPocket), 'manual');
  };

  const handleGenerated = () => {
    try {
      const pocket = securePocket();
      void recordPocket(pocket, 'generated');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Secure random draw unavailable.', 'error');
    }
  };

  const startScreenShare = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      notify('Screen sharing is not supported here. Try a recent desktop browser over HTTPS, or continue with voice/manual entry.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 12, max: 20 } }, audio: false });
      screenRef.current = stream;
      setScreenStream(stream);
      const [track] = stream.getVideoTracks();
      track?.addEventListener('ended', () => {
        if (screenRef.current === stream) {
          screenRef.current = null;
          setScreenStream(null);
          notify('Screen sharing has ended.', 'info');
        }
      }, { once: true });
      notify('Screen share connected. Choose “Entire Screen” in the browser picker when available.', 'success');
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'AbortError') notify('Screen sharing was cancelled or permission was denied. You can still enter results manually.', 'info');
      else notify(error instanceof Error ? `Could not start screen sharing: ${error.message}` : 'Could not start screen sharing.', 'error');
    }
  };

  const stopScreenShare = () => {
    screenRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current = null;
    setScreenStream(null);
    notify('Screen sharing stopped. The shared screen was not recorded or uploaded.', 'info');
  };

  const startVoiceCapture = () => {
    const browser = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) {
      notify('Speech recognition is not available in this browser. Use pocket entry below; spoken readout may still work.', 'error');
      return;
    }
    try {
      window.speechSynthesis?.cancel();
      const recognition = new Recognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (!result.isFinal) continue;
          const transcript = result[0]?.transcript.trim() ?? '';
          const pocket = parseSpokenPocket(transcript);
          if (pocket === null) notify(`Heard “${transcript}”, but no pocket from 0 to 36 was clear. Try again or enter it manually.`, 'info');
          else { setPendingPocket(pocket); setPendingTranscript(transcript); }
        }
      };
      recognition.onerror = (event) => {
        const detail = event.error === 'not-allowed' ? 'Microphone permission was denied.' : event.error === 'no-speech' ? 'No speech detected. Try again.' : `Speech recognition issue${event.error ? `: ${event.error}` : ''}.`;
        notify(`${detail} You can always enter a number manually.`, 'error');
      };
      recognition.onend = () => { setVoiceActive(false); recognitionRef.current = null; };
      recognitionRef.current = recognition;
      recognition.start();
      setVoiceActive(true);
      notify('Listening for a spoken pocket from 0 to 36. Review each detected number before saving.', 'success');
    } catch (error) {
      setVoiceActive(false);
      notify(error instanceof Error ? error.message : 'Could not start speech recognition.', 'error');
    }
  };

  const stopVoiceCapture = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setVoiceActive(false);
  };

  const confirmVoiceResult = () => {
    if (pendingPocket === null) return;
    const pocket = pendingPocket;
    setPendingPocket(null);
    setPendingTranscript('');
    void recordPocket(pocket, 'voice');
  };

  const saveCorrection = async (spin: Spin) => {
    const pocket = Number(editValue);
    if (!Number.isInteger(pocket) || pocket < 0 || pocket > 36) return notify('Choose a valid pocket from 0 to 36.', 'error');
    try {
      await updateSpin({ ...spin, pocket, corrected: true });
      await refreshHistory();
      setEditTarget(null);
      notify(`Spin corrected to pocket ${pocket}.`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not correct this spin.', 'error');
    }
  };

  const removeSpin = async (spin: Spin) => {
    if (!window.confirm(`Delete pocket ${spin.pocket} from the local history?`)) return;
    try { await deleteSpin(spin.id); await refreshHistory(); notify('Spin deleted from local history.', 'success'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not delete this spin.', 'error'); }
  };

  const clearAll = async () => {
    if (!spins.length || !window.confirm(`Delete all ${spins.length.toLocaleString()} locally saved spins? This cannot be undone.`)) return;
    try { await clearHistory(); await refreshHistory(); setLastPocket(null); notify('Local history cleared.', 'success'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not clear local history.', 'error'); }
  };

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseHistoricalCsv(await file.text());
      await addSpins(parsed.drafts);
      await refreshHistory();
      setFilter('imported');
      notify(`Imported ${parsed.drafts.length.toLocaleString()} spins from ${file.name}${parsed.skipped ? `; skipped ${parsed.skipped} invalid row(s)` : ''}.`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not import this CSV.', 'error');
    } finally {
      event.target.value = '';
    }
  };

  const exportCsv = () => {
    if (!filteredSpins.length) return notify('There are no spins in this view to export.', 'info');
    const blob = new Blob([serializeCsv(filteredSpins)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `spinwise-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify(`${filteredSpins.length.toLocaleString()} spins exported to CSV.`, 'success');
  };

  const viewSpins = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...filteredSpins].reverse().filter((spin) => {
      if (!q) return true;
      return String(spin.pocket).includes(q) || pocketColor(spin.pocket).includes(q) || sourceName(spin.source).toLowerCase().includes(q) || formatDate(spin.createdAt).toLowerCase().includes(q);
    });
  }, [filteredSpins, search]);

  const lastResult = lastPocket ?? filteredSpins.at(-1)?.pocket ?? null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand-lockup" href="#top" aria-label="Spinwise dashboard home"><BrandMark /><span className="brand-copy"><strong>spinwise<span>.</span></strong><small>ROULETTE ANALYZER</small></span></a>
        <nav className="top-nav" aria-label="Main navigation"><a className="nav-active" href="#live">Live desk</a><a href="#analysis">Analysis</a><a href="#history">History</a></nav>
        <div className="top-actions">
          <span className="local-badge"><span /> LOCAL HISTORY</span>
          <button className={`voice-toggle ${voiceOn ? 'is-on' : ''}`} onClick={() => setVoiceOn((on) => !on)} aria-pressed={voiceOn} title="Toggle automatic spoken readout"><Icon name="speaker" size={15} /><span>Voice {voiceOn ? 'on' : 'off'}</span></button>
        </div>
      </header>

      <section className="hero-strip" id="top">
        <div className="hero-copy"><p className="eyebrow"><span className="live-dot" /> FIELD NOTES / EUROPEAN WHEEL</p><h1>Read the run.<br /><em>Respect the odds.</em></h1><p className="hero-sub">A private workspace for capturing spins and studying the history—not guessing what comes next.</p></div>
        <div className="hero-stats">
          <div className="hero-stat"><span>IN THIS VIEW</span><strong>{filteredSpins.length.toLocaleString()}</strong><small>recorded spins</small></div>
          <div className="hero-stat"><span>POCKET COVERAGE</span><strong>{uniquePockets}<i>/37</i></strong><small>unique outcomes seen</small></div>
          <div className="hero-stat hero-stat-accent"><span>WHEEL MODEL</span><strong>0—36</strong><small>European · single zero</small></div>
        </div>
      </section>

      <aside className="independence-banner" role="note"><span className="banner-icon"><Icon name="shield" size={17} /></span><p><strong>History describes; it does not predict.</strong> On a fair wheel, every spin is independent. A “hot” number, streak, or gap is not a reliable signal for the next result.</p><span className="banner-right">37 POCKETS <b>·</b> 1 ZERO</span></aside>

      <section className="desk-grid" id="live">
        <article className="panel share-panel">
          <div className="panel-heading"><div><p className="eyebrow">01 / INPUT CHANNEL</p><h2>Screen link</h2></div><span className={`status-tag ${screenStream ? 'status-live' : ''}`}><i />{screenStream ? 'SHARING' : 'STANDBY'}</span></div>
          <div className={`screen-stage ${screenStream ? 'screen-active' : ''}`}>
            {screenStream ? <><video ref={videoRef} autoPlay playsInline muted aria-label="Preview of the screen you are sharing" /><div className="screen-corner screen-corner-tl">LIVE FEED</div><div className="screen-corner screen-corner-br"><span className="live-dot" /> PRIVATE PREVIEW</div></> : <div className="screen-placeholder"><div className="screen-glyph"><Icon name="screen" size={28} /></div><span className="scan-line" /><strong>Your screen, your call.</strong><p>Start sharing, then choose <b>Entire Screen</b> in your browser’s picker where available.</p></div>}
          </div>
          <div className="share-controls">
            {!screenStream ? <button className="button button-secondary" onClick={() => void startScreenShare()}><Icon name="play" size={15} /> Share entire screen</button> : <button className="button button-danger" onClick={stopScreenShare}><Icon name="stop" size={15} /> Stop sharing</button>}
            <span className="microcopy">{screenSupported ? 'Permission-based · not recorded or uploaded' : 'Screen capture unavailable in this browser'}</span>
          </div>
          <div className="privacy-note"><span className="privacy-lock"><Icon name="shield" size={14} /></span><span><b>Private by design</b><small>Screen preview stays in this tab. History is stored only on this browser.</small></span></div>
          <div className="share-limitation">Screen pixels are previewed only; this version does not read wheel graphics automatically. Voice capture uses your microphone (not shared-screen audio), or enter the result manually.</div>
        </article>

        <article className="panel live-panel">
          <div className="panel-heading"><div><p className="eyebrow">02 / LIVE CAPTURE</p><h2>Log a result</h2></div><span className="signal-label"><i /> READY</span></div>
          <div className="result-console">
            <div className="console-grid" />
            <div className="console-label">LATEST POCKET <span>·</span> {filteredSpins.length ? 'LOCAL RECORD' : 'AWAITING INPUT'}</div>
            <div className={`result-number ${lastResult !== null ? pocketTone(lastResult) : 'tone-empty'}`}>{lastResult === null ? '—' : String(lastResult).padStart(2, '0')}</div>
            <div className="result-classification">{lastResult === null ? 'No result recorded' : pocketLabel(lastResult)}</div>
            <div className="console-actions">
              <button className="button button-primary" onClick={handleGenerated} disabled={busy}><Icon name="spark" size={15} /> {busy ? 'Saving…' : 'Secure test draw'}</button>
              {lastResult !== null && <button className="icon-button console-speak" onClick={() => speakPocket(lastResult)} title={`Speak pocket ${lastResult}`} aria-label={`Speak pocket ${lastResult}`}><Icon name="speaker" size={16} /></button>}
            </div>
            <span className="console-corner">CSPRNG / 37</span>
          </div>
          <div className="capture-block">
            <div className="capture-title"><span className="capture-icon"><Icon name="mic" size={15} /></span><div><strong>Spoken input</strong><small>Say a number, then confirm what was heard</small></div><span className={`mic-pulse ${voiceActive ? 'is-listening' : ''}`} /></div>
            <button className={`button voice-button ${voiceActive ? 'button-danger' : 'button-outline'}`} onClick={voiceActive ? stopVoiceCapture : startVoiceCapture}><Icon name={voiceActive ? 'stop' : 'mic'} size={15} />{voiceActive ? 'Stop listening' : 'Start listening'}</button>
            {pendingPocket !== null && <div className="confirmation-box"><div><span className="eyebrow">RECOGNIZED · “{pendingTranscript}”</span><strong>Pocket {pendingPocket} <i className={`tiny-ball ${pocketTone(pendingPocket)}`} /></strong></div><select aria-label="Correct recognized pocket before saving" value={pendingPocket} onChange={(event) => setPendingPocket(Number(event.target.value))}>{Array.from({ length: 37 }, (_, pocket) => <option value={pocket} key={pocket}>{pocket} · {pocketColor(pocket)}</option>)}</select><button className="button button-primary button-small" onClick={confirmVoiceResult}><Icon name="check" size={14} /> Record</button><button className="icon-button" onClick={() => setPendingPocket(null)} aria-label="Discard recognized number"><Icon name="x" size={15} /></button></div>}
            {!voiceActive && <p className="capture-hint">Microphone access is requested by your browser. Speech recognition may be processed by the browser provider; privacy and support vary. Manual entry stays on this device.</p>}
          </div>
          <form className="manual-form" onSubmit={handleManualSubmit}>
            <label htmlFor="manual-pocket">Manual entry <span>— no microphone required</span></label>
            <div className="manual-input-row"><div className="select-wrap"><select id="manual-pocket" value={manualPocket} onChange={(event) => setManualPocket(event.target.value)}><option value="">Choose 0–36</option>{Array.from({ length: 37 }, (_, pocket) => <option value={pocket} key={pocket}>{String(pocket).padStart(2, '0')}　{pocketColor(pocket)}</option>)}</select><Icon name="chevron-down" size={14} /></div><button className="button button-outline manual-add" disabled={busy || !manualPocket}><Icon name="plus" size={15} /> Add</button></div>
          </form>
        </article>

        <article className="panel latest-panel">
          <div className="panel-heading"><div><p className="eyebrow">03 / SESSION LOG</p><h2>Recent spins</h2></div><a className="text-link" href="#history">Full history <Icon name="arrow-up-right" size={13} /></a></div>
          <div className="recent-strip-head"><span>POCKET</span><span>RESULT / SOURCE</span><span>TIME</span></div>
          {filteredSpins.length === 0 ? <div className="empty-recent"><div className="empty-orbit"><span /></div><strong>No spins in this view yet</strong><small>Capture a spoken result, add it manually, or import a CSV.</small></div> : <div className="recent-list">{[...filteredSpins].reverse().slice(0, 7).map((spin, index) => <div className="recent-row" key={spin.id}><span className={`recent-ball ${pocketTone(spin.pocket)}`}>{String(spin.pocket).padStart(2, '0')}</span><span className="recent-detail"><b>{pocketColor(spin.pocket)} <i>·</i> {parity(spin.pocket)}</b><small>{spin.corrected ? 'Corrected · ' : ''}{sourceName(spin.source)}{index === 0 ? ' · latest' : ''}</small></span><time>{formatClock(spin.createdAt)}</time></div>)}</div>}
          <div className="history-foot"><span><i className="history-dot" /> SAVED ON THIS DEVICE</span><span>{filteredSpins.length.toLocaleString()} ITEMS</span></div>
        </article>
      </section>

      <section className="analysis-section" id="analysis">
        <div className="section-heading"><div><p className="eyebrow">04 / HISTORICAL ANALYSIS</p><h2>What the sample says</h2><p>Compare recorded frequencies with a European wheel’s theoretical distribution.</p></div><div className="analysis-toolbar"><label htmlFor="session-filter">DATA SCOPE</label><div className="select-wrap"><select id="session-filter" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All history · {spins.length}</option><option value="session">This browser session · {spins.filter((s) => s.sessionId === currentSession).length}</option><option value="imported">Imported datasets · {spins.filter((s) => s.source === 'imported').length}</option>{sessions.map((session) => <option value={session.id} key={session.id}>{session.imported ? 'Imported · ' : 'Session · '}{formatDate(session.newest)} · {session.count}</option>)}</select><Icon name="chevron-down" size={14} /></div></div></div>

        <div className="analysis-disclaimer"><Icon name="activity" size={17} /><p><strong>A fit test is a diagnostic, not a verdict.</strong> A flagged sample can occur by chance; a passing sample does not prove fairness, security, or predict the next spin.</p><span>α = 0.05 APPROX.</span></div>

        <div className="distribution-layout">
          <DistributionCard distribution={distributions[0]} />
          <div className="category-column">{distributions.slice(1).map((distribution) => <DistributionCard key={distribution.name} distribution={distribution} />)}</div>
        </div>

        <div className="patterns-heading"><div><p className="eyebrow">05 / SEQUENCE EXPLORER</p><h2>Patterns in hindsight</h2></div><span className="retrospective-tag"><Icon name="shield" size={13} /> RETROSPECTIVE ONLY</span></div>
        <div className="pattern-grid">
          <article className="pattern-card"><span className="pattern-icon"><Icon name="refresh" size={17} /></span><p className="eyebrow">CONSECUTIVE REPEATS</p><strong>{patterns.repeatCount}</strong><small>adjacent spins with the same pocket in this sample</small></article>
          <article className="pattern-card"><span className="pattern-icon pattern-icon-red"><Icon name="activity" size={17} /></span><p className="eyebrow">LONGEST COLOR RUN</p><strong>{patterns.longestColorRun.length ? `${patterns.longestColorRun.length}×` : '—'}</strong><small>{patterns.longestColorRun.length ? `${patterns.longestColorRun.color} in a row · green resets the run` : 'record more spins to see runs'}</small></article>
          <article className="pattern-card gap-card"><div className="gap-heading"><div><p className="eyebrow">LARGEST CURRENT GAPS</p><small>spins since each pocket last appeared</small></div><Icon name="activity" size={17} /></div><div className="gap-list">{patterns.droughts.map((item) => <div className="gap-row" key={item.pocket}><span className={`mini-ball ${pocketTone(item.pocket)}`}>{item.pocket}</span><span className="gap-track"><i style={{ width: `${filteredSpins.length ? Math.min(100, item.gap / filteredSpins.length * 100) : 0}%` }} /></span><b>{item.gap}</b></div>)}</div></article>
          <article className="pattern-card sequence-card"><div className="gap-heading"><div><p className="eyebrow">LATEST SEQUENCE</p><small>most recent outcomes · newest first</small></div><span className="sequence-count">{patterns.recentSequence.length} / 18</span></div><div className="sequence-pockets">{patterns.recentSequence.length ? patterns.recentSequence.map((spin, i) => <span className={`sequence-ball ${pocketTone(spin.pocket)}`} key={`${spin.id}-${i}`} title={`${spin.pocket} · ${pocketColor(spin.pocket)}`}>{spin.pocket}</span>) : <span className="sequence-empty">Results will appear here when you record or import spins.</span>}</div><div className="category-traces">{patterns.categoryTraces.map((trace) => <div className="category-trace" key={trace.label}><span>{trace.label}</span><div>{trace.values.length ? trace.values.map((value, i) => <i key={`${trace.label}-${i}`}>{value}</i>) : <small>—</small>}</div></div>)}</div><p className="sequence-footnote">Category traces: R/B/G · O/E/0 · dozen · column; newest first. Descriptive only—not a betting signal.</p></article>
        </div>
      </section>

      <section className="history-section" id="history">
        <div className="section-heading history-heading"><div><p className="eyebrow">06 / LOCAL ARCHIVE</p><h2>Spin ledger</h2><p>Review, correct, import, or export your local records.</p></div><div className="ledger-actions"><input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={(event) => void importCsv(event)} hidden /><button className="button button-outline" onClick={() => fileInputRef.current?.click()}><Icon name="file-up" size={15} /> Import CSV</button><button className="button button-outline" onClick={exportCsv}><Icon name="download" size={15} /> Export view</button><button className="button button-quiet-danger" onClick={() => void clearAll()} disabled={!spins.length}><Icon name="trash" size={14} /> Clear</button></div></div>
        <div className="ledger-filter-row"><div className="ledger-count"><strong>{viewSpins.length.toLocaleString()}</strong> {viewSpins.length === 1 ? 'spin' : 'spins'} <span>·</span> {filter === 'all' ? 'all history' : filter === 'session' ? 'this browser session' : filter === 'imported' ? 'imported datasets' : 'selected session'}</div><label className="search-box"><span className="search-glyph">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find pocket, color, source…" aria-label="Search spin history" /></label></div>
        <div className="ledger-table-wrap"><table className="ledger-table"><thead><tr><th>POCKET</th><th>COLOR / CLASSIFICATION</th><th>CAPTURE SOURCE</th><th>SESSION / TIMESTAMP</th><th>ACTIONS</th></tr></thead><tbody>{viewSpins.slice(0, 100).map((spin) => <tr key={spin.id}><td><span className={`table-ball ${pocketTone(spin.pocket)}`}>{String(spin.pocket).padStart(2, '0')}</span></td><td><span className="ledger-classification"><i className={`color-swatch ${pocketTone(spin.pocket)}`} />{pocketColor(spin.pocket)} <span>·</span> {parity(spin.pocket)} <span>·</span> {dozen(spin.pocket)} <span>·</span> {column(spin.pocket)}</span></td><td><span className="source-pill">{spin.corrected ? 'Corrected · ' : ''}{sourceName(spin.source)}</span></td><td><span className="session-date">{spin.sessionId.startsWith('import-') ? 'Imported set' : spin.sessionId === currentSession ? 'Current session' : spin.sessionId.slice(0, 10)}</span><small className="table-time">{formatDate(spin.createdAt)} · {formatClock(spin.createdAt)}</small></td><td><div className="row-actions">{editTarget === spin.id ? <><select aria-label="Correct pocket value" value={editValue} onChange={(event) => setEditValue(event.target.value)}>{Array.from({ length: 37 }, (_, pocket) => <option value={pocket} key={pocket}>{pocket}</option>)}</select><button className="icon-button action-confirm" title="Save correction" aria-label="Save correction" onClick={() => void saveCorrection(spin)}><Icon name="check" size={15} /></button><button className="icon-button" title="Cancel correction" aria-label="Cancel correction" onClick={() => setEditTarget(null)}><Icon name="x" size={15} /></button></> : <><button className="icon-button" title={`Speak pocket ${spin.pocket}`} aria-label={`Speak pocket ${spin.pocket}`} onClick={() => speakPocket(spin.pocket)}><Icon name="speaker" size={14} /></button><button className="icon-button" title="Correct pocket" aria-label="Correct pocket" onClick={() => { setEditTarget(spin.id); setEditValue(String(spin.pocket)); }}><Icon name="edit" size={14} /></button><button className="icon-button action-delete" title="Delete spin" aria-label="Delete spin" onClick={() => void removeSpin(spin)}><Icon name="trash" size={14} /></button></>}</div></td></tr>)}</tbody></table>{viewSpins.length === 0 && <div className="ledger-empty"><span className="empty-mini-icon"><Icon name="activity" size={18} /></span><strong>{filteredSpins.length ? 'No matches in this view' : 'Your ledger is ready'}</strong><small>{filteredSpins.length ? 'Try a different search term.' : 'Record a result or import a historical CSV to begin.'}</small></div>}{viewSpins.length > 100 && <p className="ledger-limit">Showing 100 most recent matches of {viewSpins.length.toLocaleString()}. Export to CSV for the full view.</p>}</div>
        <div className="ledger-foot"><span>LOCAL BROWSER STORAGE <b>·</b> NOT SYNCED TO A SERVER</span><a href={`${import.meta.env.BASE_URL}roulette_rng.py`} download>Download Python CSPRNG reference <Icon name="arrow-up-right" size={13} /></a></div>
      </section>

      <footer className="footer"><a className="footer-brand" href="#top"><BrandMark /><strong>spinwise<span>.</span></strong></a><span>European roulette · 37 pockets · independent outcomes</span><span>ANALYSIS TOOL <b>·</b> NOT A PREDICTION SYSTEM</span></footer>

      {notice && <div className={`toast toast-${notice.kind}`} role="status"><span className="toast-symbol">{notice.kind === 'success' ? <Icon name="check" size={15} /> : notice.kind === 'error' ? <Icon name="x" size={15} /> : <Icon name="bell" size={15} />}</span><span>{notice.message}</span><button onClick={() => setNotice(null)} aria-label="Dismiss notification"><Icon name="x" size={14} /></button></div>}
    </main>
  );
}

export default App;
