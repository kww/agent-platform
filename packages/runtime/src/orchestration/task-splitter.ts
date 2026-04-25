/**
 * 任务拆分器
 * 
 * 功能：
 * 1. 将会议决策转换为 tasks.yml
 * 2. 解析任务依赖关系
 * 3. 计算任务优先级
 * 4. 分配任务给角色
 * 
 * 使用示例：
 * ```typescript
 * const splitter = new TaskSplitter({
 *   contextSharer,
 *   llmClient,
 * });
 * 
 * const tasks = await splitter.splitTasks('meeting-123', decisions);
 * ```
 */

import type { ContextSharer } from './context-sharer';
import type { LLMClient } from './discussion-driver';

/**
 * 任务拆分器配置
 */
export interface TaskSplitterConfig {
  contextSharer: ContextSharer;
  llmClient: LLMClient;
  projectAnalyzer?: ProjectAnalyzer;
  eventEmitter?: {
    emit(event: string, data: any): void;
  };
}

/**
 * 项目分析器接口
 */
export interface ProjectAnalyzer {
  analyze(projectPath: string): Promise<ProjectStructure>;
}

/**
 * 项目结构
 */
export interface ProjectStructure {
  type: 'frontend' | 'backend' | 'fullstack' | 'library' | 'other';
  frameworks: string[];
  entryPoints: string[];
  testFramework?: string;
  dependencies: Record<string, string>;
}

/**
 * 验收条件（支持字符串或对象格式）
 */
export type AcceptanceCriteria = string | {
  description: string;
  e2e_test?: string;
  test_name?: string;
};

/**
 * 任务
 */
export interface Task {
  id: string;
  name: string;
  description: string;
  assignee: TaskAssignee;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'pending' | 'in_progress' | 'blocked' | 'completed';
  files: string[];
  acceptance: AcceptanceCriteria[];
  dependsOn: string[];
  estimatedHours?: number;
  labels?: string[];
}

/**
 * 任务受让人类型
 */
export type TaskAssignee = 
  | 'developer'
  | 'architect'
  | 'tester'
  | 'devops'
  | 'designer'
  | 'any';

/**
 * 任务拆分结果
 */
export interface TaskSplitResult {
  tasks: Task[];
  dependencies: TaskDependency[];
  statistics: TaskStatistics;
  warnings?: string[];
}

/**
 * 任务依赖
 */
export interface TaskDependency {
  from: string;
  to: string;
  type: 'hard' | 'soft' | 'optional';
}

/**
 * 任务统计
 */
export interface TaskStatistics {
  total: number;
  byPriority: Record<string, number>;
  byAssignee: Record<string, number>;
  criticalPath: string[];
  estimatedTotalHours: number;
}

/**
 * 决策输入
 */
export interface DecisionInput {
  id: string;
  content: string;
  agreed: boolean;
  priority?: 'high' | 'medium' | 'low';
}

/**
 * 任务拆分器
 */
export class TaskSplitter {
  private contextSharer: ContextSharer;
  private llmClient: LLMClient;
  private projectAnalyzer?: ProjectAnalyzer;
  private eventEmitter?: { emit(event: string, data: any): void };

  constructor(config: TaskSplitterConfig) {
    this.contextSharer = config.contextSharer;
    this.llmClient = config.llmClient;
    this.projectAnalyzer = config.projectAnalyzer;
    this.eventEmitter = config.eventEmitter;
  }

  /**
   * 拆分任务
   */
  async splitTasks(
    meetingId: string,
    decisions: DecisionInput[]
  ): Promise<TaskSplitResult> {
    const startTime = Date.now();

    this.emit('task_split.started', { meetingId, decisionCount: decisions.length });

    // 获取会议上下文
    const meeting = await this.getMeeting(meetingId);

    // 获取项目结构（如果可用）
    const projectStructure = await this.analyzeProject(meeting.projectPath);

    // 构建 prompt
    const prompt = this.buildSplitPrompt(meeting, decisions, projectStructure);

    // 调用 LLM 生成任务
    const response = await this.llmClient.chat(prompt, {
      temperature: 0.5,
      maxTokens: 4000,
    });

    // 解析任务
    const tasks = this.parseTasks(response);

    // 解析依赖关系
    const dependencies = this.extractDependencies(tasks);

    // 计算优先级和关键路径
    this.calculatePriorities(tasks, dependencies);

    // 生成统计信息
    const statistics = this.generateStatistics(tasks, dependencies);

    // 检查问题
    const warnings = this.detectWarnings(tasks, dependencies);

    this.emit('task_split.completed', {
      meetingId,
      taskCount: tasks.length,
      duration: Date.now() - startTime,
    });

    // 保存任务
    await this.saveTasks(meetingId, tasks);

    return {
      tasks,
      dependencies,
      statistics,
      warnings,
    };
  }

  /**
   * 构建拆分 prompt
   */
  private buildSplitPrompt(
    meeting: MeetingContext,
    decisions: DecisionInput[],
    projectStructure?: ProjectStructure
  ): string {
    const projectContext = projectStructure
      ? `
## 项目结构
- 类型：${projectStructure.type}
- 框架：${projectStructure.frameworks.join(', ')}
- 测试框架：${projectStructure.testFramework ?? '未配置'}
`
      : '';

    return `根据会议决策拆分任务：

## 会议主题
${meeting.title}

## 会议描述
${meeting.description ?? '无'}

${projectContext}

## 决策列表
${decisions.map((d, i) => `${i + 1}. [${d.priority ?? 'medium'}] ${d.content}`).join('\n')}

## 输出格式（YAML）
tasks:
  - id: "TASK-001"
    name: "任务名称"
    description: "任务详细描述"
    assignee: "developer|architect|tester|devops|designer|any"
    priority: "P0|P1|P2|P3"
    files:
      - "src/path/to/file.ts"
    acceptance:
      - description: "验收条件 1"
        e2e_test: "meetings.e2e.test.ts"  # 可选：关联的 E2E 测试文件
        test_name: "创建会议"              # 可选：具体测试用例名称
      - description: "验收条件 2"
    depends_on: []
    estimated_hours: 4
    labels:
      - "feature"

## 拆分原则
1. 每个任务应该是可独立完成的最小单元
2. 任务粒度：2-8 小时为宜
3. 明确验收条件，可测试
4. 合理估算工时
5. 标注依赖关系（depends_on: ["TASK-XXX"]）
6. 高优先级决策 → P0/P1 任务
7. 架构决策 → architect 任务
8. 测试相关 → tester 任务

请输出 YAML 格式的任务列表：`;
  }

  /**
   * 解析任务
   */
  private parseTasks(yamlStr: string): Task[] {
    // 尝试提取 YAML
    const yamlMatch = yamlStr.match(/```yaml\n([\s\S]*?)\n```/);
    const yamlContent = yamlMatch ? yamlMatch[1] : yamlStr;

    // 简单的 YAML 解析（实际项目应使用 yaml 库）
    const tasks: Task[] = [];
    const lines = yamlContent.split('\n');
    let currentTask: Partial<Task> | null = null;
    let currentArrayKey: 'files' | 'acceptance' | 'dependsOn' | 'labels' | null = null;
    let currentAcceptanceObj: Partial<AcceptanceCriteria> | null = null;

    for (const line of lines) {
      const indent = line.search(/\S/);
      const content = line.trim();

      if (content.startsWith('- id:')) {
        // 新任务开始
        if (currentAcceptanceObj && currentTask) {
          // 保存未完成的对象
          const arr = currentTask.acceptance;
          if (Array.isArray(arr)) {
            arr.push(this.finalizeAcceptance(currentAcceptanceObj));
          }
          currentAcceptanceObj = null;
        }
        if (currentTask && currentTask.id) {
          tasks.push(this.finalizeTask(currentTask));
        }
        currentTask = {
          id: this.parseValue(content),
          status: 'pending',
          files: [],
          acceptance: [],
          dependsOn: [],
          labels: [],
        };
        currentArrayKey = null;
      } else if (currentTask) {
        if (content.startsWith('name:')) {
          currentTask.name = this.parseValue(content);
        } else if (content.startsWith('description:')) {
          currentTask.description = this.parseValue(content);
        } else if (content.startsWith('assignee:')) {
          currentTask.assignee = this.parseValue(content) as TaskAssignee;
        } else if (content.startsWith('priority:')) {
          currentTask.priority = this.parseValue(content) as Task['priority'];
        } else if (content.startsWith('estimated_hours:')) {
          currentTask.estimatedHours = parseInt(this.parseValue(content), 10);
        } else if (content.startsWith('files:')) {
          currentArrayKey = 'files';
        } else if (content.startsWith('acceptance:')) {
          currentArrayKey = 'acceptance';
        } else if (content.startsWith('depends_on:')) {
          currentArrayKey = 'dependsOn';
        } else if (content.startsWith('labels:')) {
          currentArrayKey = 'labels';
        } else if (currentArrayKey === 'acceptance') {
          // 解析 acceptance 数组（支持对象和字符串格式）
          if (content.startsWith('- description:')) {
            // 新对象开始
            if (currentAcceptanceObj) {
              const arr = currentTask.acceptance;
              if (Array.isArray(arr)) {
                arr.push(this.finalizeAcceptance(currentAcceptanceObj));
              }
            }
            currentAcceptanceObj = { description: this.parseValue(content) };
          } else if (currentAcceptanceObj) {
            // 继续对象属性
            if (content.startsWith('e2e_test:')) {
              currentAcceptanceObj.e2e_test = this.parseValue(content);
            } else if (content.startsWith('test_name:')) {
              currentAcceptanceObj.test_name = this.parseValue(content);
            }
          } else if (content.startsWith('- ')) {
            // 字符串格式
            const arr = currentTask.acceptance;
            if (Array.isArray(arr)) {
              arr.push(this.parseArrayValue(content));
            }
          }
        } else if (content.startsWith('- ') && currentArrayKey) {
          const array = currentTask[currentArrayKey];
          if (Array.isArray(array)) {
            array.push(this.parseArrayValue(content));
          }
        }
      }
    }

    // 添加最后一个 acceptance 对象
    if (currentAcceptanceObj && currentTask) {
      const arr = currentTask.acceptance;
      if (Array.isArray(arr)) {
        arr.push(this.finalizeAcceptance(currentAcceptanceObj));
      }
    }

    // 添加最后一个任务
    if (currentTask && currentTask.id) {
      tasks.push(this.finalizeTask(currentTask));
    }

    return tasks;
  }

  /**
   * 完善验收条件对象
   */
  private finalizeAcceptance(obj: Partial<AcceptanceCriteria>): AcceptanceCriteria {
    if (typeof obj === 'string') return obj;
    if (obj.description) {
      return {
        description: obj.description,
        e2e_test: obj.e2e_test,
        test_name: obj.test_name,
      };
    }
    return String(obj);
  }

  /**
   * 解析 YAML 值
   */
  private parseValue(line: string): string {
    const match = line.match(/:\s*"?([^"]*)"?$/);
    return match ? match[1].trim() : '';
  }

  /**
   * 解析 YAML 数组元素值
   */
  private parseArrayValue(line: string): string {
    // 处理 "- value" 或 "- "value"" 格式
    const match = line.match(/-\s*"?([^"]*)"?$/);
    return match ? match[1].trim() : '';
  }

  /**
   * 完善任务对象
   */
  private finalizeTask(partial: Partial<Task>): Task {
    return {
      id: partial.id ?? `TASK-${Date.now()}`,
      name: partial.name ?? '未命名任务',
      description: partial.description ?? '',
      assignee: partial.assignee ?? 'any',
      priority: partial.priority ?? 'P2',
      status: partial.status ?? 'pending',
      files: partial.files ?? [],
      acceptance: partial.acceptance ?? [],
      dependsOn: partial.dependsOn ?? [],
      estimatedHours: partial.estimatedHours,
      labels: partial.labels ?? [],
    };
  }

  /**
   * 提取依赖关系
   */
  private extractDependencies(tasks: Task[]): TaskDependency[] {
    const dependencies: TaskDependency[] = [];

    for (const task of tasks) {
      for (const depId of task.dependsOn) {
        dependencies.push({
          from: depId,
          to: task.id,
          type: 'hard',
        });
      }
    }

    return dependencies;
  }

  /**
   * 计算优先级
   */
  private calculatePriorities(tasks: Task[], dependencies: TaskDependency[]): void {
    // 构建依赖图
    const depMap = new Map<string, string[]>();
    for (const dep of dependencies) {
      const existing = depMap.get(dep.to) ?? [];
      existing.push(dep.from);
      depMap.set(dep.to, existing);
    }

    // 计算每个任务的后继数量（影响范围）
    const successorCount = new Map<string, number>();
    for (const task of tasks) {
      successorCount.set(task.id, this.countSuccessors(task.id, dependencies));
    }

    // 调整优先级：影响范围大的任务优先级提升
    for (const task of tasks) {
      const successors = successorCount.get(task.id) ?? 0;
      
      // 有 3+ 后继的任务，优先级提升一级
      if (successors >= 3 && task.priority !== 'P0') {
        const priorityOrder = ['P0', 'P1', 'P2', 'P3'];
        const currentIndex = priorityOrder.indexOf(task.priority);
        if (currentIndex > 0) {
          task.priority = priorityOrder[currentIndex - 1] as Task['priority'];
        }
      }
    }
  }

  /**
   * 计算后继数量
   */
  private countSuccessors(taskId: string, dependencies: TaskDependency[]): number {
    let count = 0;
    const visited = new Set<string>();

    const queue = dependencies
      .filter(d => d.from === taskId)
      .map(d => d.to);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      count++;

      // 添加后继的后继
      for (const dep of dependencies) {
        if (dep.from === current && !visited.has(dep.to)) {
          queue.push(dep.to);
        }
      }
    }

    return count;
  }

  /**
   * 生成统计信息
   */
  private generateStatistics(
    tasks: Task[],
    dependencies: TaskDependency[]
  ): TaskStatistics {
    const byPriority: Record<string, number> = {};
    const byAssignee: Record<string, number> = {};

    let totalHours = 0;

    for (const task of tasks) {
      byPriority[task.priority] = (byPriority[task.priority] ?? 0) + 1;
      byAssignee[task.assignee] = (byAssignee[task.assignee] ?? 0) + 1;
      totalHours += task.estimatedHours ?? 4;
    }

    // 计算关键路径（简化版：最长路径）
    const criticalPath = this.findCriticalPath(tasks, dependencies);

    return {
      total: tasks.length,
      byPriority,
      byAssignee,
      criticalPath,
      estimatedTotalHours: totalHours,
    };
  }

  /**
   * 查找关键路径
   */
  private findCriticalPath(tasks: Task[], dependencies: TaskDependency[]): string[] {
    // 简化实现：返回 P0 任务的顺序
    const p0Tasks = tasks.filter(t => t.priority === 'P0');
    
    if (p0Tasks.length === 0) {
      return tasks.slice(0, 5).map(t => t.id);
    }

    // 按 ID 排序
    return p0Tasks.map(t => t.id).sort();
  }

  /**
   * 检测警告
   */
  private detectWarnings(tasks: Task[], dependencies: TaskDependency[]): string[] {
    const warnings: string[] = [];

    // 检测循环依赖
    if (this.hasCircularDependency(tasks, dependencies)) {
      warnings.push('检测到循环依赖，请检查任务依赖关系');
    }

    // 检测孤立任务
    const isolated = tasks.filter(t => 
      t.dependsOn.length === 0 && 
      !dependencies.some(d => d.from === t.id)
    );
    
    if (isolated.length > 0) {
      warnings.push(`有 ${isolated.length} 个任务无依赖关系，可能需要重新评估`);
    }

    // 检测估算时间过长
    const longTasks = tasks.filter(t => (t.estimatedHours ?? 0) > 16);
    if (longTasks.length > 0) {
      warnings.push(`有 ${longTasks.length} 个任务估算超过 16 小时，建议拆分`);
    }

    // 检测无验收条件的任务
    const noAcceptance = tasks.filter(t => t.acceptance.length === 0);
    if (noAcceptance.length > 0) {
      warnings.push(`有 ${noAcceptance.length} 个任务无验收条件，建议补充`);
    }

    return warnings;
  }

  /**
   * 检测循环依赖
   */
  private hasCircularDependency(tasks: Task[], dependencies: TaskDependency[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const taskIds = new Set(tasks.map(t => t.id));

    const hasCycle = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);

      const successors = dependencies
        .filter(d => d.from === taskId)
        .map(d => d.to);

      for (const successor of successors) {
        if (!visited.has(successor)) {
          if (hasCycle(successor)) return true;
        } else if (recursionStack.has(successor)) {
          return true;
        }
      }

      recursionStack.delete(taskId);
      return false;
    };

    for (const taskId of taskIds) {
      if (!visited.has(taskId)) {
        if (hasCycle(taskId)) return true;
      }
    }

    return false;
  }

  /**
   * 获取会议上下文
   */
  private async getMeeting(meetingId: string): Promise<MeetingContext> {
    const meta = await this.contextSharer.getValue<MeetingMeta>(`meeting:${meetingId}:meta`);
    
    return {
      meetingId,
      title: meta?.title ?? '未命名会议',
      description: meta?.description,
      projectPath: meta?.projectPath,
    };
  }

  /**
   * 分析项目结构
   */
  private async analyzeProject(projectPath?: string): Promise<ProjectStructure | undefined> {
    if (!projectPath || !this.projectAnalyzer) {
      return undefined;
    }

    try {
      return await this.projectAnalyzer.analyze(projectPath);
    } catch (error) {
      this.emit('task_split.project_analysis_failed', {
        projectPath,
        error: String(error),
      });
      return undefined;
    }
  }

  /**
   * 保存任务
   */
  private async saveTasks(meetingId: string, tasks: Task[]): Promise<void> {
    await this.contextSharer.set(`meeting:${meetingId}:tasks`, tasks);
  }

  /**
   * 发送事件
   */
  private emit(event: string, data: any): void {
    this.eventEmitter?.emit(event, data);
  }
}

/**
 * 会议上下文
 */
interface MeetingContext {
  meetingId: string;
  title: string;
  description?: string;
  projectPath?: string;
}

/**
 * 会议元数据
 */
interface MeetingMeta {
  meetingId?: string;
  title?: string;
  description?: string;
  projectPath?: string;
  startedAt?: string;
}

/**
 * 创建任务拆分器
 */
export function createTaskSplitter(config: TaskSplitterConfig): TaskSplitter {
  return new TaskSplitter(config);
}
