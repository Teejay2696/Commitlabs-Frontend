'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  effectiveStatus,
  fmt,
  loadCommitments,
  maturityOf,
  progressOf,
  projectedYield,
  saveCommitments,
  specFor,
  type Commitment,
} from '@/lib/commitments';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useWallet } from '@/components/WalletProvider';
import { fetchXlmBalance } from '@/lib/wallet';

// Single source for the numbers shown in the exit dialog and applied to the commitment.
function exitBreakdown(c: Commitment) {
  const penaltyAmount = (c.amount * c.penalty) / 100;
  return { principal: c.amount, penaltyPct: c.penalty, penaltyAmount, returned: c.amount - penaltyAmount };
}

export default function DashboardPage() {
  const { status, address } = useWallet();
  const [list, setList] = useState<Commitment[] | null>(null);
  const [pending, setPending] = useState<{ kind: 'exit' | 'remove'; id: string } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    setList(loadCommitments());
  }, []);

  useEffect(() => {
    setBalance(null);
    if (address) fetchXlmBalance(address).then(setBalance);
  }, [address]);

  function update(id: string, patch: Partial<Commitment>) {
    setList((prev) => {
      const next = (prev ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c));
      saveCommitments(next);
      return next;
    });
  }

  function remove(id: string) {
    setList((prev) => {
      const next = (prev ?? []).filter((c) => c.id !== id);
      saveCommitments(next);
      return next;
    });
  }

  function confirmPending() {
    if (!pending) return;
    const c = (list ?? []).find((x) => x.id === pending.id);
    setPending(null);
    if (!c) return;
    if (pending.kind === 'exit') {
      update(c.id, { status: 'exited' });
      setAnnouncement(`Commitment ${c.id} exited early`);
    } else {
      remove(c.id);
      setAnnouncement(`Commitment ${c.id} removed`);
    }
  }

  if (!list)
    return (
      <section className="container page" aria-busy="true">
        <p role="status">Loading...</p>
      </section>
    );

  const target = pending ? list.find((c) => c.id === pending.id) : undefined;
  const breakdown = target ? exitBreakdown(target) : null;

  const live = list.filter((c) => ['active', 'matured'].includes(effectiveStatus(c)));
  const locked = live.reduce((s, c) => s + c.amount, 0);
  const yieldTotal = live.reduce((s, c) => s + projectedYield(c), 0);
  const matured = list.filter((c) => effectiveStatus(c) === 'matured').length;

  return (
    <section className="container page">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div className="row between wrap">
        <h1>Dashboard</h1>
        <Link href="/create" className="btn btn-primary">
          New commitment
        </Link>
      </div>

      <div className="grid4">
        <div className="card metric">
          <span className="muted">Active commitments</span>
          <b>{live.length}</b>
        </div>
        <div className="card metric">
          <span className="muted">Total locked</span>
          <b>{fmt(locked)}</b>
        </div>
        <div className="card metric">
          <span className="muted">Projected yield</span>
          <b>{fmt(yieldTotal)}</b>
        </div>
        <div className="card metric">
          <span className="muted">{status === 'connected' ? 'Wallet XLM (testnet)' : 'Ready to settle'}</span>
          <b>{status === 'connected' ? (balance ? fmt(Number(balance)) : 'n/a') : matured}</b>
        </div>
      </div>

      <h2 className="mt">Your commitments</h2>
      {list.length === 0 ? (
        <div className="card center">
          <p className="muted">No commitments yet.</p>
          <Link href="/create" className="btn btn-primary">
            Create your first
          </Link>
        </div>
      ) : (
        <div className="stack">
          {list.map((c) => {
            const st = effectiveStatus(c);
            const pct = Math.round(progressOf(c) * 100);
            const shown = st === 'settled' || st === 'exited' ? 100 : pct;
            const left =Math.max(0, Math.ceil((maturityOf(c) - Date.now()) / 86_400_000));
            return (
              <article className="card commit" key={c.id}>
                <div className="row between wrap">
                  <div>
                    <h3>
                      {fmt(c.amount)} {c.asset}{' '}
                      <span className={`badge ${st}`}>{st}</span>
                    </h3>
                    <p className="muted small">
                      {c.id} &middot; {specFor(c.type).name} &middot; {c.apy}% APY &middot; max
                      loss {c.maxLoss}%
                    </p>
                  </div>
                  <div className="row">
                    {st === 'matured' && (
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          update(c.id, { status: 'settled' });
                          setAnnouncement(`Commitment ${c.id} settled`);
                        }}
                      >
                        Settle
                      </button>
                    )}
                    {st === 'active' && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => setPending({ kind: 'exit', id: c.id })}
                      >
                        Early exit
                      </button>
                    )}
                    {(st === 'settled' || st === 'exited') && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => setPending({ kind: 'remove', id: c.id })}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div
                  className="bar"
                  role="progressbar"
                  aria-label={`Lock progress for ${c.id}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={shown}
                  aria-valuetext={
                    st === 'active'
                      ? `${pct}% elapsed, ${left} day${left === 1 ? '' : 's'} left`
                      : st === 'matured'
                        ? '100% elapsed, matured'
                        : st === 'settled'
                          ? 'Settled'
                          : 'Exited early'
                  }
                >
                  <div style={{ width: `${shown}%` }} />
                </div>
                <p className="muted small">
                  {st === 'active'
                    ? `${pct}% elapsed, ${left} day${left === 1 ? '' : 's'} to maturity`
                    : st === 'matured'
                      ? `Matured. Projected payout ${fmt(c.amount + projectedYield(c))} ${c.asset}`
                      : st === 'settled'
                        ? `Settled with ${fmt(projectedYield(c))} ${c.asset} yield`
                        : `Exited early, ${fmt(exitBreakdown(c).penaltyAmount)} ${c.asset} penalty paid`}
                </p>
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!pending && !!target}
        title={pending?.kind === 'exit' ? 'Exit early?' : 'Remove commitment?'}
        description={
          pending?.kind === 'exit'
            ? 'Exiting early forfeits part of your principal and cannot be undone.'
            : target
              ? `Remove ${target.id} from your dashboard. This cannot be undone.`
              : undefined
        }
        confirmLabel={pending?.kind === 'exit' ? 'Exit early' : 'Remove'}
        cancelLabel="Keep commitment"
        destructive
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      >
        {pending?.kind === 'exit' && target && breakdown && (
          <dl className="dialog-breakdown">
            <dt>Principal</dt>
            <dd>
              {fmt(breakdown.principal)} {target.asset}
            </dd>
            <dt>Penalty</dt>
            <dd>{breakdown.penaltyPct}%</dd>
            <dt>Penalty amount</dt>
            <dd>
              {fmt(breakdown.penaltyAmount)} {target.asset}
            </dd>
            <dt>Amount returned</dt>
            <dd>
              {fmt(breakdown.returned)} {target.asset}
            </dd>
          </dl>
        )}
      </ConfirmDialog>
    </section>
  );
}
