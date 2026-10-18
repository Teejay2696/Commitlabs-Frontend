'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  TYPES,
  fmt,
  loadCommitments,
  newId,
  saveCommitments,
  specFor,
  type Commitment,
  type CommitmentType,
} from '@/lib/commitments';
import { useWallet } from '@/components/WalletProvider';
import { ESCROW_CONTRACT_ID, explorerContractUrl } from '@/lib/config';

const ASSETS = ['USDC', 'XLM', 'EURC'];
const STEP_LABELS = ['Type', 'Configure', 'Review', 'Done'];

export default function CreatePage() {
  const { address } = useWallet();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<CommitmentType>('balanced');
  const [asset, setAsset] = useState('USDC');
  const [amount, setAmount] = useState('1000');
  const [days, setDays] = useState('30');
  const [agree, setAgree] = useState(false);
  const [created, setCreated] = useState<Commitment | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('type');
    if (t === 'safe' || t === 'balanced' || t === 'aggressive') {
      setType(t);
      setDays(String(specFor(t).minDays));
    }
  }, []);

  const spec = specFor(type);
  const amt = Number(amount);
  const dur = Number(days);
  const amountErr = !Number.isFinite(amt) || amt <= 0 ? 'Enter an amount greater than zero.' : null;
  const daysErr =
    !Number.isInteger(dur) || dur < spec.minDays
      ? `Minimum lock for ${spec.name} is ${spec.minDays} days.`
      : dur > 365
        ? 'Maximum lock is 365 days.'
        : null;
  const valid = !amountErr && !daysErr;
  const projected = valid ? (amt * (spec.apy / 100) * dur) / 365 : 0;

  function pickType(t: CommitmentType) {
    setType(t);
    const min = specFor(t).minDays;
    if (!Number.isInteger(Number(days)) || Number(days) < min) setDays(String(min));
  }

  function submit() {
    const c: Commitment = {
      id: newId(),
      type,
      asset,
      amount: amt,
      durationDays: dur,
      maxLoss: spec.maxLoss,
      penalty: spec.penalty,
      apy: spec.apy,
      createdAt: Date.now(),
      status: 'active',
      owner: address,
      txHash: null,
    };
    saveCommitments([c, ...loadCommitments()]);
    setCreated(c);
    setStep(3);
  }

  return (
    <section className="container page narrow">
      <h1>Create a commitment</h1>
      <ol className="steps" aria-label="Progress">
        {STEP_LABELS.map((l, i) => (
          <li key={l} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <span>{i + 1}</span> {l}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="stack">
          <div className="grid3">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`card pick ${type === t.id ? 'selected' : ''}`}
                onClick={() => pickType(t.id)}
                aria-pressed={type === t.id}
              >
                <h3>{t.name}</h3>
                <p className="muted">{t.tagline}</p>
                <b>{t.apy}% APY</b>
              </button>
            ))}
          </div>
          <div className="row end">
            <button className="btn btn-primary" onClick={() => setStep(1)}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card stack">
          <label>
            Asset
            <select value={asset} onChange={(e) => setAsset(e.target.value)}>
              {ASSETS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            Amount
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!amountErr}
            />
            {amountErr && <small className="err">{amountErr}</small>}
          </label>
          <label>
            Lock duration (days)
            <input
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              aria-invalid={!!daysErr}
            />
            {daysErr && <small className="err">{daysErr}</small>}
          </label>
          <ul className="kv">
            <li>
              <span>Max loss tolerance</span>
              <b>{spec.maxLoss}%</b>
            </li>
            <li>
              <span>Early exit penalty</span>
              <b>{spec.penalty}%</b>
            </li>
            <li>
              <span>Projected yield</span>
              <b>
                {fmt(projected)} {asset}
              </b>
            </li>
          </ul>
          <div className="row between">
            <button className="btn btn-ghost" onClick={() => setStep(0)}>
              Back
            </button>
            <button className="btn btn-primary" disabled={!valid} onClick={() => setStep(2)}>
              Review
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card stack">
          <h2>Review</h2>
          <ul className="kv">
            <li>
              <span>Type</span>
              <b>{spec.name}</b>
            </li>
            <li>
              <span>Principal</span>
              <b>
                {fmt(amt)} {asset}
              </b>
            </li>
            <li>
              <span>Duration</span>
              <b>{dur} days</b>
            </li>
            <li>
              <span>Target APY</span>
              <b>{spec.apy}%</b>
            </li>
            <li>
              <span>Projected yield</span>
              <b>
                {fmt(projected)} {asset}
              </b>
            </li>
            <li>
              <span>Early exit penalty</span>
              <b>
                {spec.penalty}% ({fmt((amt * spec.penalty) / 100)} {asset})
              </b>
            </li>
          </ul>
          <label className="check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            I understand leaving early applies the penalty and these terms cannot be changed.
          </label>
          <p className="muted small">
            Demo mode: the commitment is recorded in this browser. On-chain submission to the
            testnet escrow contract is enabled once a contract ID is configured
            {ESCROW_CONTRACT_ID ? '.' : ' (none set in this deployment).'}
          </p>
          <div className="row between">
            <button className="btn btn-ghost" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn btn-primary" disabled={!agree} onClick={submit}>
              Create commitment
            </button>
          </div>
        </div>
      )}

      {step === 3 && created && (
        <div className="card stack center">
          <div className="check-big" aria-hidden="true">
            &#10003;
          </div>
          <h2>Commitment created</h2>
          <p className="muted">
            {created.id} &middot; {fmt(created.amount)} {created.asset} for {created.durationDays}{' '}
            days
          </p>
          {ESCROW_CONTRACT_ID && (
            <a href={explorerContractUrl(ESCROW_CONTRACT_ID)} target="_blank" rel="noreferrer">
              View escrow contract on Stellar Expert
            </a>
          )}
          <div className="row center-row">
            <Link href="/dashboard" className="btn btn-primary">
              Go to dashboard
            </Link>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setStep(0);
                setAgree(false);
                setCreated(null);
              }}
            >
              Create another
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
