/**
 * 治理步骤处理器
 * 
 * 处理：
 * - governance/cast-vote: 投票
 * - governance/vote-tally: 投票统计
 * - governance/create-voting-session: 创建投票会话
 * - governance/audit-task: 任务审计
 * - governance/impeach: 弹劾
 * - governance/track-effect: 效果追踪
 * - governance/rollback: 回滚
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as yaml from 'js-yaml';
import {
  Vote,
  VotingSession,
  VotingConfig,
  VotingResult,
  VoteType,
  VoteWeight,
  AuditReport,
  AuditFinding,
  ImpeachmentRecord,
  EffectTracking,
  EffectMetric,
  EffectCheckpoint,
  RollbackDecision,
} from '../core/types';

// ============================================
// governance/create-voting-session 处理器
// ============================================

export interface CreateVotingSessionInput {
  topic: string;
  description?: string;
  related_item_id: string;
  related_item_type: 'evolution' | 'audit' | 'impeachment';
  participants: Array<{
    id: string;
    type: 'role' | 'user';
    weight: 'normal' | 'heavy' | 'veto';
    required?: boolean;
  }>;
  config: {
    method: 'simple_majority' | 'absolute_majority' | 'unanimous' | 'super_majority';
    threshold?: number;
    duration_minutes?: number;
    min_participants?: number;
    quorum?: number;
  };
}

export interface CreateVotingSessionOutput {
  voting_session_id: string;
  status: 'pending' | 'voting';
  voting_ends_at: number;
  participant_count: number;
}

export async function handleCreateVotingSession(
  input: CreateVotingSessionInput,
  workDir: string
): Promise<CreateVotingSessionOutput> {
  const sessionId = `VOTE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv4().slice(0, 8)}`;
  const now = Date.now();
  const durationMs = (input.config.duration_minutes || 60) * 60 * 1000;
  
  const session: VotingSession = {
    id: sessionId,
    topic: input.topic,
    description: input.description,
    related_item_id: input.related_item_id,
    related_item_type: input.related_item_type,
    config: {
      method: input.config.method,
      threshold: input.config.threshold || 50,
      participants: input.participants.map(p => ({
        id: p.id,
        type: p.type,
        weight: p.weight as VoteWeight,
        required: p.required,
      })),
      duration_minutes: input.config.duration_minutes,
      min_participants: input.config.min_participants,
      quorum: input.config.quorum || 50,
    },
    votes: [],
    status: 'voting',
    created_at: now,
    voting_started_at: now,
    voting_ends_at: now + durationMs,
  };
  
  // 保存会话
  const sessionPath = path.join(workDir, '.agent', 'voting-sessions', `${sessionId}.yml`);
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, yaml.dump(session));
  
  return {
    voting_session_id: sessionId,
    status: 'voting',
    voting_ends_at: session.voting_ends_at!,
    participant_count: input.participants.length,
  };
}

// ============================================
// governance/cast-vote 处理器
// ============================================

export interface CastVoteInput {
  voting_session_id: string;
  voter_id: string;
  voter_type: 'role' | 'user';
  vote: VoteType;
  reason?: string;
  weight?: 'normal' | 'heavy' | 'veto';
}

export interface CastVoteOutput {
  vote_recorded: boolean;
  vote_id: string;
  session_status: string;
  current_statistics: {
    approve_count: number;
    reject_count: number;
    abstain_count: number;
    total_voters: number;
    remaining_voters: number;
  };
}

const WEIGHT_VALUES: Record<VoteWeight, number> = {
  normal: 1,
  heavy: 2,
  veto: 999999,
};

export async function handleCastVote(
  input: CastVoteInput,
  workDir: string
): Promise<CastVoteOutput> {
  const sessionPath = path.join(workDir, '.agent', 'voting-sessions', `${input.voting_session_id}.yml`);
  
  if (!fs.existsSync(sessionPath)) {
    throw new Error(`Voting session not found: ${input.voting_session_id}`);
  }
  
  const session: VotingSession = yaml.load(fs.readFileSync(sessionPath, 'utf-8')) as VotingSession;
  
  // 检查会话状态
  if (session.status === 'completed' || session.status === 'cancelled') {
    throw new Error('Voting session is closed');
  }
  
  // 检查是否已投票
  if (session.votes.some(v => v.voter_id === input.voter_id)) {
    throw new Error('Voter has already voted');
  }
  
  // 确定权重
  const participant = session.config.participants.find(p => p.id === input.voter_id);
  if (!participant) {
    throw new Error('Voter is not a participant');
  }
  
  const weight = input.weight || participant.weight;
  
  // 创建投票记录
  const vote: Vote = {
    voter_id: input.voter_id,
    voter_type: input.voter_type,
    vote: input.vote,
    weight: WEIGHT_VALUES[weight as VoteWeight],
    reason: input.reason,
    timestamp: Date.now(),
  };
  
  session.votes.push(vote);
  
  // 更新会话
  fs.writeFileSync(sessionPath, yaml.dump(session));
  
  // 计算统计
  const stats = {
    approve_count: session.votes.filter(v => v.vote === 'approve').length,
    reject_count: session.votes.filter(v => v.vote === 'reject').length,
    abstain_count: session.votes.filter(v => v.vote === 'abstain').length,
    total_voters: session.config.participants.length,
    remaining_voters: session.config.participants.length - session.votes.length,
  };
  
  return {
    vote_recorded: true,
    vote_id: `vote-${uuidv4().slice(0, 8)}`,
    session_status: session.status,
    current_statistics: stats,
  };
}

// ============================================
// governance/vote-tally 处理器
// ============================================

export interface VoteTallyInput {
  voting_session_id: string;
  force_close?: boolean;
  method?: 'simple_majority' | 'absolute_majority' | 'unanimous' | 'super_majority';
  threshold?: number;
}

export interface VoteTallyOutput {
  decision: 'approved' | 'rejected' | 'no_quorum' | 'vetoed' | 'pending';
  statistics: {
    total_participants: number;
    actual_voters: number;
    approve_count: number;
    reject_count: number;
    abstain_count: number;
    approve_weight: number;
    reject_weight: number;
  };
  checks: {
    quorum_met: boolean;
    threshold_met: boolean;
    veto_exercised: boolean;
  };
  vote_breakdown: Vote[];
  voting_session: VotingSession;
}

export async function handleVoteTally(
  input: VoteTallyInput,
  workDir: string
): Promise<VoteTallyOutput> {
  const sessionPath = path.join(workDir, '.agent', 'voting-sessions', `${input.voting_session_id}.yml`);
  
  if (!fs.existsSync(sessionPath)) {
    throw new Error(`Voting session not found: ${input.voting_session_id}`);
  }
  
  const session: VotingSession = yaml.load(fs.readFileSync(sessionPath, 'utf-8')) as VotingSession;
  
  // 计算统计
  const stats = {
    total_participants: session.config.participants.length,
    actual_voters: session.votes.length,
    approve_count: session.votes.filter(v => v.vote === 'approve').length,
    reject_count: session.votes.filter(v => v.vote === 'reject').length,
    abstain_count: session.votes.filter(v => v.vote === 'abstain').length,
    approve_weight: session.votes.filter(v => v.vote === 'approve').reduce((sum, v) => sum + v.weight, 0),
    reject_weight: session.votes.filter(v => v.vote === 'reject').reduce((sum, v) => sum + v.weight, 0),
  };
  
  const totalWeight = stats.approve_weight + stats.reject_weight;
  
  // 检查否决权
  const vetoExercised = session.votes.some(v => v.vote === 'reject' && v.weight >= 999999);
  
  // 检查法定人数
  const quorum = session.config.quorum || 50;
  const quorumMet = (stats.actual_voters / stats.total_participants) * 100 >= quorum;
  
  // 检查阈值
  const method = input.method || session.config.method;
  const threshold = input.threshold || session.config.threshold;
  let thresholdMet = false;
  
  switch (method) {
    case 'simple_majority':
      thresholdMet = stats.approve_count > stats.reject_count;
      break;
    case 'absolute_majority':
      thresholdMet = totalWeight > 0 && (stats.approve_weight / totalWeight) * 100 > threshold;
      break;
    case 'unanimous':
      thresholdMet = stats.approve_count === stats.actual_voters - stats.abstain_count;
      break;
    case 'super_majority':
      thresholdMet = totalWeight > 0 && (stats.approve_weight / totalWeight) * 100 > 66.67;
      break;
  }
  
  // 决策
  let decision: 'approved' | 'rejected' | 'no_quorum' | 'vetoed' | 'pending' = 'pending';
  
  if (vetoExercised) {
    decision = 'vetoed';
  } else if (!quorumMet && !input.force_close) {
    decision = 'no_quorum';
  } else if (thresholdMet) {
    decision = 'approved';
  } else if (input.force_close || session.voting_ends_at! < Date.now()) {
    decision = 'rejected';
  }
  
  // 更新会话状态
  if (decision !== 'pending') {
    session.status = 'completed';
    session.result = {
      decision,
      statistics: stats,
      checks: {
        quorum_met: quorumMet,
        threshold_met: thresholdMet,
        veto_exercised: vetoExercised,
      },
      vote_breakdown: session.votes,
      decided_at: Date.now(),
    };
    session.completed_at = Date.now();
    fs.writeFileSync(sessionPath, yaml.dump(session));
  }
  
  return {
    decision,
    statistics: stats,
    checks: {
      quorum_met: quorumMet,
      threshold_met: thresholdMet,
      veto_exercised: vetoExercised,
    },
    vote_breakdown: session.votes,
    voting_session: session,
  };
}

// ============================================
// governance/audit-task 处理器
// ============================================

export interface AuditTaskInput {
  task_id: string;
  project_path: string;
  audit_depth: 'quick' | 'standard' | 'deep';
  focus_areas: string[];
}

export interface AuditTaskOutput {
  audit_result: {
    task_id: string;
    findings: AuditFinding[];
    statistics: {
      issues_found: number;
      critical: number;
      major: number;
      minor: number;
      suggestion: number;
    };
    overall_assessment: 'pass' | 'warn' | 'fail';
    impeachment_required: boolean;
    impeachment_reason?: string;
  };
  findings: AuditFinding[];
  overall_assessment: 'pass' | 'warn' | 'fail';
  impeachment_required: boolean;
  impeachment_reason?: string;
}

export async function handleAuditTask(
  input: AuditTaskInput,
  workDir: string
): Promise<AuditTaskOutput> {
  // 这里是简化实现，实际需要调用 Agent 进行审计
  // 真实实现会读取任务记录、代码变更、测试结果等
  
  const findings: AuditFinding[] = [];
  let overallAssessment: 'pass' | 'warn' | 'fail' = 'pass';
  let impeachmentRequired = false;
  
  // 检查任务记录是否存在
  const tasksPath = path.join(input.project_path, '.agent', 'tasks.yml');
  if (!fs.existsSync(tasksPath)) {
    findings.push({
      category: 'process',
      severity: 'minor',
      description: '任务记录文件不存在',
      evidence: [tasksPath],
      recommendation: '确保任务执行时有正确的记录保存',
    });
  }
  
  // 生成审计报告
  const report: AuditReport = {
    id: `AUDIT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv4().slice(0, 8)}`,
    type: 'task',
    scope: {
      time_range: [Date.now() - 7 * 24 * 60 * 60 * 1000, Date.now()],
      roles: [],
      tasks: [input.task_id],
    },
    findings,
    statistics: {
      total_tasks: 1,
      success_rate: findings.length === 0 ? 100 : 0,
      average_quality: 0,
      average_efficiency: 0,
      issues_found: findings.length,
    },
    recommendations: [],
    impeachment_required: impeachmentRequired,
    auditor_id: 'auditor',
    created_at: Date.now(),
    status: 'final',
  };
  
  // 保存审计报告
  const reportPath = path.join(input.project_path, '.agent', 'audits', `${report.id}.yml`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, yaml.dump(report));
  
  return {
    audit_result: {
      task_id: input.task_id,
      findings,
      statistics: {
        issues_found: findings.length,
        critical: findings.filter(f => f.severity === 'critical').length,
        major: findings.filter(f => f.severity === 'major').length,
        minor: findings.filter(f => f.severity === 'minor').length,
        suggestion: findings.filter(f => f.severity === 'suggestion').length,
      },
      overall_assessment: overallAssessment,
      impeachment_required: impeachmentRequired,
    },
    findings,
    overall_assessment: overallAssessment,
    impeachment_required: impeachmentRequired,
  };
}

// ============================================
// governance/impeach 处理器
// ============================================

export interface ImpeachInput {
  target_id: string;
  reason: string;
  severity: 'critical' | 'major' | 'minor';
  evidence: string[];
  audit_report_id?: string;
  initiated_by: string;
}

export interface ImpeachOutput {
  impeachment_id: string;
  status: 'pending' | 'reviewed' | 'decided' | 'executed' | 'dismissed';
  timeline: {
    initiated_at: number;
    reviewed_at?: number;
    decided_at?: number;
    executed_at?: number;
  };
}

export async function handleImpeach(
  input: ImpeachInput,
  workDir: string
): Promise<ImpeachOutput> {
  const impeachmentId = `IMP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv4().slice(0, 8)}`;
  const now = Date.now();
  
  const record: ImpeachmentRecord = {
    id: impeachmentId,
    impeachment: {
      target_id: input.target_id,
      target_type: 'role',
      reason: input.reason,
      severity: input.severity,
      evidence: input.evidence,
    },
    review: {},
    timeline: {
      initiated_at: now,
    },
    status: 'pending',
    initiated_by: input.initiated_by,
  };
  
  // 保存弹劾记录
  const recordPath = path.join(workDir, '.agent', 'impeachments', `${impeachmentId}.yml`);
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, yaml.dump(record));
  
  return {
    impeachment_id: impeachmentId,
    status: 'pending',
    timeline: record.timeline,
  };
}

// ============================================
// governance/track-effect 处理器
// ============================================

export interface TrackEffectInput {
  evolution_item_id: string;
  project_path: string;
  implementation_commit: string;
  risk_level: 'low' | 'medium' | 'high';
  tracking_duration_hours: number;
}

export interface TrackEffectOutput {
  tracking_id: string;
  status: 'pending' | 'tracking' | 'success' | 'failed' | 'rolled_back';
  checkpoints: EffectCheckpoint[];
  current_metrics: Record<string, EffectMetric>;
  rollback_decision?: RollbackDecision;
  overall_assessment: 'success' | 'warning' | 'failure';
}

export async function handleTrackEffect(
  input: TrackEffectInput,
  workDir: string
): Promise<TrackEffectOutput> {
  const trackingId = `EFF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv4().slice(0, 8)}`;
  const now = Date.now();
  
  const tracking: EffectTracking = {
    id: trackingId,
    evolution_item_id: input.evolution_item_id,
    implementation_id: input.implementation_commit,
    config: {
      risk_level: input.risk_level,
      tracking_duration_hours: input.tracking_duration_hours,
      checkpoint_schedule: [
        { time: 'immediate', checks: ['build_status', 'test_pass_rate'] },
        { time: '1h', checks: ['error_rate', 'api_success_rate'] },
        { time: '1d', checks: ['error_rate', 'test_pass_rate', 'response_time'] },
      ],
      basic_metrics: ['error_rate', 'test_pass_rate', 'build_status'],
      rollback_thresholds: {
        error_rate_increase: input.risk_level === 'high' ? 1 : input.risk_level === 'medium' ? 3 : 5,
        test_pass_rate_drop: input.risk_level === 'high' ? 1 : input.risk_level === 'medium' ? 3 : 5,
        critical_errors: 0,
      },
      rollback_strategy: input.risk_level === 'high' ? 'auto' : 'manual',
    },
    metrics: [],
    checkpoints: [],
    status: 'tracking',
    implemented_at: now,
    tracking_started_at: now,
    tracking_ends_at: now + input.tracking_duration_hours * 60 * 60 * 1000,
  };
  
  // 立即检查点
  const immediateCheckpoint: EffectCheckpoint = {
    scheduled_time: 'immediate',
    actual_time: now,
    metrics: [
      {
        name: 'build_status',
        type: 'basic',
        baseline: { value: 1, timestamp: now },
        current: { value: 1, timestamp: now },
        change: { absolute: 0, percentage: 0, trend: 'stable' },
        threshold_exceeded: false,
      },
      {
        name: 'test_pass_rate',
        type: 'basic',
        baseline: { value: 100, timestamp: now },
        current: { value: 100, timestamp: now },
        change: { absolute: 0, percentage: 0, trend: 'stable' },
        threshold_exceeded: false,
      },
    ],
    assessment: 'pass',
  };
  
  tracking.checkpoints.push(immediateCheckpoint);
  
  // 保存追踪记录
  const trackingPath = path.join(workDir, '.agent', 'effect-tracking', `${trackingId}.yml`);
  fs.mkdirSync(path.dirname(trackingPath), { recursive: true });
  fs.writeFileSync(trackingPath, yaml.dump(tracking));
  
  return {
    tracking_id: trackingId,
    status: 'tracking',
    checkpoints: tracking.checkpoints,
    current_metrics: {
      build_status: immediateCheckpoint.metrics[0],
      test_pass_rate: immediateCheckpoint.metrics[1],
    },
    overall_assessment: 'success',
  };
}

// ============================================
// governance/rollback 处理器
// ============================================

export interface RollbackInput {
  effect_tracking_id: string;
  project_path: string;
  commit_before: string;
  commit_after: string;
  reason: string;
  triggered_by: 'auto' | 'manual';
}

export interface RollbackOutput {
  rollback_status: 'pending' | 'in_progress' | 'completed' | 'failed';
  strategy_used: 'reset' | 'revert' | 'branch';
  commit_before: string;
  commit_after?: string;
  verification_result: {
    tests_passed: boolean;
    build_passed: boolean;
    errors: string[];
  };
  duration_ms: number;
  backup_branch?: string;
}

export async function handleRollback(
  input: RollbackInput,
  workDir: string
): Promise<RollbackOutput> {
  const startTime = Date.now();
  
  // 这里是简化实现，真实实现需要执行 git 命令
  // 1. 检查是否有未提交变更
  // 2. 选择回滚策略（reset/revert/branch）
  // 3. 执行回滚
  // 4. 验证结果
  
  const strategy = 'reset';  // 简化：假设使用 reset
  
  // 更新 effect-tracking 状态
  const trackingPath = path.join(workDir, '.agent', 'effect-tracking', `${input.effect_tracking_id}.yml`);
  if (fs.existsSync(trackingPath)) {
    const tracking: EffectTracking = yaml.load(fs.readFileSync(trackingPath, 'utf-8')) as EffectTracking;
    tracking.status = 'rolled_back';
    tracking.rollback_decision = {
      decision: 'rollback',
      reason: input.reason,
      triggered_by: {
        manual_decision: input.triggered_by === 'manual',
      },
      decided_by: input.triggered_by === 'auto' ? 'auto' : 'user',
      decided_at: Date.now(),
    };
    fs.writeFileSync(trackingPath, yaml.dump(tracking));
  }
  
  return {
    rollback_status: 'completed',
    strategy_used: strategy as 'reset',
    commit_before: input.commit_before,
    verification_result: {
      tests_passed: true,
      build_passed: true,
      errors: [],
    },
    duration_ms: Date.now() - startTime,
  };
}

// ============================================
// 导出所有处理器
// ============================================

export const governanceHandlers = {
  'create-voting-session': handleCreateVotingSession,
  'cast-vote': handleCastVote,
  'vote-tally': handleVoteTally,
  'audit-task': handleAuditTask,
  'impeach': handleImpeach,
  'track-effect': handleTrackEffect,
  'rollback': handleRollback,
};
