"use client";

import { useEffect, useState } from "react";
import { Rose } from "./ui";
import { EqBars, Icon } from "./Icons";

/*
 * The birthday reveal at /birthday: Happy Birthday, tap the bow for the
 * $100 gift card, then a short animated tour of what the app does, then
 * into the app. Nothing here talks to Sonos or Spotify.
 */

type Step = "intro" | "gift" | "tour";

export default function Birthday() {
  const [step, setStep] = useState<Step>("intro");
  return (
    <div className={"bday " + step}>
      <Rose className="bday-rose" />
      {step === "intro" ? <Intro onNext={() => setStep("gift")} /> : null}
      {step === "gift" ? <GiftBox onNext={() => setStep("tour")} /> : null}
      {step === "tour" ? <Tour /> : null}
    </div>
  );
}

function Intro({ onNext }: { onNext: () => void }) {
  return (
    <div className="bday-stage">
      <p className="bday-eyebrow">September 27</p>
      <h1 className="bday-title">
        Happy
        <br />
        Birthday,
        <br />
        <span>Dad</span>
      </h1>
      <p className="bday-p">Two presents. One is in this box. The other is the phone you&apos;re holding.</p>
      <button className="primary bday-go" onClick={onNext}>
        Open the first one
      </button>
    </div>
  );
}

type Bit = { left: number; delay: number; dur: number; rot: number; color: string; w: number };

function GiftBox({ onNext }: { onNext: () => void }) {
  const [open, setOpen] = useState(false);
  const [confetti, setConfetti] = useState<Bit[]>([]);
  const unwrap = () => {
    setOpen(true);
    setConfetti(
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        dur: 2.6 + Math.random() * 1.8,
        rot: Math.random() * 720 - 360,
        color: ["#fdd431", "#ffdd5c", "#e8eaed", "#ff9900", "#c9ced8"][i % 5],
        w: 6 + Math.random() * 6,
      })),
    );
  };
  return (
    <div className="bday-stage">
      {confetti.map((c, i) => (
        <i
          key={i}
          className="bday-confetti"
          style={{ left: c.left + "%", animationDelay: c.delay + "s", animationDuration: c.dur + "s", background: c.color, width: c.w, height: c.w * 0.6, ["--rot" as string]: c.rot + "deg" }}
        />
      ))}
      <p className="bday-eyebrow">{open ? "Present one" : "Tap the bow"}</p>
      <button className={"bday-box" + (open ? " open" : "")} onClick={unwrap} aria-label={open ? "Opened" : "Open the present"} disabled={open}>
        <span className="bday-lid">
          <span className="bday-bow" />
        </span>
        <span className="bday-body">
          <span className="bday-ribbon-v" />
          <span className="bday-ribbon-h" />
        </span>
        <span className="bday-gc">
          <span className="bday-gc-brand">amazon</span>
          <span className="bday-gc-amt">$100</span>
          <span className="bday-gc-sub">gift card</span>
        </span>
      </button>
      {open ? (
        <div className="bday-after">
          <h2 className="bday-h">$100 to spend on anything you want.</h2>
          <p className="bday-p">Love, Stephen</p>
          <button className="primary bday-go" onClick={onNext}>
            There&apos;s one more
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- The tour: five short scenes, each plays itself, tap to skip ahead ---------- */

const SCENES = 5;
const HOLD = [4200, 4200, 4600, 5200, 0];

function Tour() {
  const [scene, setScene] = useState(0);
  useEffect(() => {
    if (!HOLD[scene]) return;
    const t = setTimeout(() => setScene((s) => Math.min(SCENES - 1, s + 1)), HOLD[scene]);
    return () => clearTimeout(t);
  }, [scene]);
  const next = () => setScene((s) => Math.min(SCENES - 1, s + 1));
  return (
    <div className="bday-stage bday-tour" onClick={scene < SCENES - 1 ? next : undefined}>
      <p className="bday-eyebrow">Present two</p>
      {scene === 0 ? <SceneRooms key="rooms" /> : null}
      {scene === 1 ? <SceneTogether key="together" /> : null}
      {scene === 2 ? <SceneSearch key="search" /> : null}
      {scene === 3 ? <SceneVoice key="voice" /> : null}
      {scene === 4 ? <SceneOpen key="open" /> : null}
      <div className="bday-dots" aria-hidden="true">
        {Array.from({ length: SCENES }, (_, i) => (
          <i key={i} className={i === scene ? "on" : i < scene ? "done" : ""} />
        ))}
      </div>
      {scene < SCENES - 1 ? <p className="bday-small">Tap to skip ahead</p> : null}
    </div>
  );
}

const ROOMS = [
  { room: "Living Room", song: "Go Your Own Way", who: "Fleetwood Mac" },
  { room: "Patio", song: "Free Fallin'", who: "Tom Petty" },
  { room: "Sunroom", song: "Whatever You Like", who: "T.I." },
];

function MiniCard({ room, song, who, i, wide }: { room: string; song: string; who: string; i: number; wide?: boolean }) {
  return (
    <div className={"tour-card" + (wide ? " wide" : "")} style={{ animationDelay: i * 0.35 + "s" }}>
      <span className="tc-room">{room}</span>
      <span className="tc-song">
        <b>{song}</b>
        <small>{who}</small>
      </span>
      <span className="tc-eq">
        <EqBars />
      </span>
    </div>
  );
}

function SceneRooms() {
  return (
    <div className="tour-scene">
      <h2 className="bday-h">Every room, its own song.</h2>
      <div className="tour-cards">
        {ROOMS.map((r, i) => (
          <MiniCard key={r.room} {...r} i={i} />
        ))}
      </div>
      <p className="bday-p">Fleetwood Mac inside, Tom Petty on the patio, and nobody has to agree.</p>
    </div>
  );
}

function SceneTogether() {
  return (
    <div className="tour-scene">
      <h2 className="bday-h">Or all of them, together.</h2>
      <div className="tour-cards merge">
        <MiniCard room="Living Room + Patio + Sunroom" song="Free Fallin'" who="Tom Petty, in every room" i={0} wide />
      </div>
      <p className="bday-p">One tap on Add rooms and the whole house plays in sync.</p>
    </div>
  );
}

function SceneSearch() {
  const full = "whatever you like";
  const [typed, setTyped] = useState("");
  const [hit, setHit] = useState(false);
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setTyped(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(t);
        setTimeout(() => setHit(true), 350);
      }
    }, 90);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="tour-scene">
      <h2 className="bday-h">Any song you can think of.</h2>
      <div className="tour-search">
        <Icon name="search" />
        <span>
          {typed}
          <i className="caret" />
        </span>
      </div>
      <div className={"tour-card result" + (hit ? " in" : "")}>
        <span className="tc-song">
          <b>Whatever You Like</b>
          <small>T.I. · Paper Trail</small>
        </span>
        <span className="tc-play">
          <Icon name="play" />
        </span>
      </div>
      <p className="bday-p">All of Spotify. Tap a song, pick a room, it plays.</p>
    </div>
  );
}

function SceneVoice() {
  const words = "Play Whatever You Like by T.I. in the sunroom".split(" ");
  const [n, setN] = useState(0);
  const [reply, setReply] = useState(false);
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= words.length) {
        clearInterval(t);
        setTimeout(() => setReply(true), 600);
      }
    }, 210);
    return () => clearInterval(t);
  }, [words.length]);
  return (
    <div className="tour-scene">
      <h2 className="bday-h">Or just say it.</h2>
      <div className="tour-mic">
        <i />
        <i />
        <Icon name="mic" />
      </div>
      <p className="tour-said">
        {words.slice(0, n).map((w, i) => (
          <span key={i}>{w} </span>
        ))}
      </p>
      <p className={"tour-reply" + (reply ? " in" : "")}>
        <Icon name="sparkle" />
        Playing Whatever You Like in the Sunroom.
      </p>
      <p className="bday-p">Hold the Talk button and ask for anything, in any room.</p>
    </div>
  );
}

function SceneOpen() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 150);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={"tour-scene bday-app" + (shown ? " in" : "")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="bday-logo" src="/brand/logo-720.webp" alt="" width={200} height={200} />
      <h1 className="bday-title sm">
        Compass <span>Classics</span>
      </h1>
      <p className="bday-p">Your own music remote for the whole house. Built for you.</p>
      <button className="primary bday-go" onClick={() => location.assign("/")}>
        <Icon name="music" />
        Open Compass Classics
      </button>
      <p className="bday-small">Made for Dad by Stephen</p>
    </div>
  );
}
