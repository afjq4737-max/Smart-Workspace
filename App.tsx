import React, { useMemo, useRef, useState } from 'react';
import {
  Lightbulb,
  ClipboardList,
  Settings,
  BadgeCheck,
  Plus,
  CheckSquare2,
  NotebookText,
  CalendarDays,
  BarChart3,
  Users,
  CirclePause,
  Bell,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { SidebarGlass } from './shared/ui/components/LiquidGlass/SidebarGlass';
import { LiquidGlassSurface } from './shared/ui/components/LiquidGlass/LiquidGlassSurface';
import { SimpleCalendar } from './shared/ui/components/Calendar/SimpleCalendar';
import { ProjectsPage } from './features/Projects/ProjectsPage';
import { TeamPage } from './features/Team/TeamPage';
import { AppStoreProvider, useAppStore } from './store/useAppStore';
import { Task, Note } from './shared/types';
import './shared/ui/styles/liquidGlass.css';

type Status = Task['status'];

const statusOrder: Status[] = ['idea', 'planned', 'progress', 'done'];

const statusMeta: Record<Status, { label: string; color: string }> = {
  idea: { label: 'Идея', color: '#FFB700' },
  planned: { label: 'Запланировано', color: '#3B82F6' },
  progress: { label: 'В процессе', color: '#10B981' },
  done: { label: 'Готово', color: '#8B5CF6' },
};

function formatUntil(ts?: number) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDateTimeLocal(ts?: number) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isTaskPaused(t: Task, all: Task[]) {
  const until = t.blocked?.until;
  const timePaused = typeof until === 'number' && until > Date.now();

  const deps = t.blocked?.dependsOn ?? [];
  const depsPaused =
    deps.length > 0 &&
    deps.some((id) => all.find((x) => x.id === id)?.status !== 'done');

  return timePaused || depsPaused;
}

function isTaskOverdue(t: Task) {
  const until = t.blocked?.until;
  return typeof until === 'number' && until > 0 && until <= Date.now();
}

function App() {
  return (
    <AppStoreProvider>
      <AppContent />
    </AppStoreProvider>
  );
}

function AppContent() {
  const store = useAppStore();
  const { tasks, notes, projects, members, addTask, updateTask, deleteTask, addNote, updateNote, deleteNote } = store;
  
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [activeSection, setActiveSection] = useState<
    'tasks' | 'notes' | 'calendar' | 'projects' | 'team'
  >('tasks');

  const [activeStatusFilter, setActiveStatusFilter] = useState<Status | null>(
    null
  );
  const [pausedOnly, setPausedOnly] = useState(false);

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const editingNote = useMemo(
    () => notes.find(n => n.id === editingNoteId) ?? null,
    [notes, editingNoteId]
  );

  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteTaskId, setNoteTaskId] = useState<string>(''); // '' = без привязки

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(
    null
  );

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const editingTask = useMemo(
    () => tasks.find((t) => t.id === editingTaskId) ?? null,
    [tasks, editingTaskId]
  );

  // локальная форма модалки редактирования
  const [editTitle, setEditTitle] = useState('');
  const [editStatus, setEditStatus] = useState<Status>('idea');
  const [editPaused, setEditPaused] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [editUntil, setEditUntil] = useState(''); // datetime-local

  const [newSubtaskText, setNewSubtaskText] = useState('');

  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState<Status>('idea');

  const [newTaskPaused, setNewTaskPaused] = useState(false);
  const [newTaskReason, setNewTaskReason] = useState('');
  const [newTaskUntil, setNewTaskUntil] = useState(''); // datetime-local string

  React.useEffect(() => {
    if (!editingTask) return;
    setEditTitle(editingTask.title);
    setEditStatus(editingTask.status);
    const hasBlocked = !!editingTask.blocked;
    setEditPaused(hasBlocked && isTaskPaused(editingTask, tasks));
    setEditReason(editingTask.blocked?.reason ?? '');
    setEditUntil(toDateTimeLocal(editingTask.blocked?.until));
  }, [editingTaskId]); // намеренно только по id

  React.useEffect(() => {
    if (!editingNote) return;
    setNoteTitle(editingNote.title);
    setNoteBody(editingNote.body);
    setNoteTaskId(editingNote.taskId ?? '');
  }, [editingNoteId]);

  function createTask() {
    const t = newTaskTitle.trim();
    if (!t) return;

    const untilTs = newTaskUntil ? new Date(newTaskUntil).getTime() : undefined;
    const blocked =
      newTaskPaused || !!untilTs || newTaskReason.trim()
        ? {
            reason: newTaskReason.trim() || undefined,
            until: untilTs,
            dependsOn: [],
          }
        : undefined;

    addTask({
      id: crypto.randomUUID?.() ?? String(Date.now()),
      title: t,
      status: newTaskStatus,
      createdAt: Date.now(),
      blocked,
      subtasks: [],
    });

    setNewTaskTitle('');
    setNewTaskStatus('idea');
    setNewTaskPaused(false);
    setNewTaskReason('');
    setNewTaskUntil('');
    setShowNewTaskModal(false);
  }

  function updateTaskLocal(id: string, patch: Partial<Task>) {
    updateTask(id, patch);
  }

  function saveEdit() {
    if (!editingTask) return;

    const title = editTitle.trim();
    if (!title) return;

    const untilTs = editUntil ? new Date(editUntil).getTime() : undefined;

    const blocked =
      editPaused || !!untilTs || editReason.trim()
        ? {
            reason: editReason.trim() || undefined,
            until: untilTs,
            dependsOn: editingTask.blocked?.dependsOn ?? [],
          }
        : undefined;

    updateTaskLocal(editingTask.id, {
      title,
      status: editStatus,
      blocked,
    });

    setEditingTaskId(null);
  }

  function finishTask(id: string) {
    updateTaskLocal(id, { status: 'done' });
    setEditingTaskId(null);
  }

  function deleteTaskLocal(id: string) {
    deleteTask(id);
    setEditingTaskId(null);
  }

  function addSubtask(taskId: string, text: string) {
    const t = text.trim();
    if (!t) return;

    const task = tasks.find(task => task.id === taskId);
    if (!task) return;

    updateTaskLocal(taskId, {
      subtasks: [
        ...task.subtasks,
        { id: crypto.randomUUID?.() ?? String(Date.now()), text: t, done: false },
      ],
    });
  }

  function toggleSubtask(taskId: string, subId: string) {
    const task = tasks.find(task => task.id === taskId);
    if (!task) return;

    updateTaskLocal(taskId, {
      subtasks: task.subtasks.map(s => (s.id === subId ? { ...s, done: !s.done } : s)),
    });
  }

  function deleteSubtask(taskId: string, subId: string) {
    const task = tasks.find(task => task.id === taskId);
    if (!task) return;

    updateTaskLocal(taskId, {
      subtasks: task.subtasks.filter(s => s.id !== subId)
    });
  }

  function openNewNote(prefTaskId?: string) {
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteBody('');
    setNoteTaskId(prefTaskId ?? '');
    setShowNoteModal(true);
  }

  function saveNote() {
    const title = noteTitle.trim() || 'Без названия';
    const body = noteBody.trim();

    if (editingNoteId) {
      updateNote(editingNoteId, { title, body, taskId: noteTaskId || undefined });
    } else {
      addNote({
        id: crypto.randomUUID?.() ?? String(Date.now()),
        title,
        body,
        createdAt: Date.now(),
        taskId: noteTaskId || undefined,
      });
    }

    setShowNoteModal(false);
  }

  function deleteNoteLocal(id: string) {
    deleteNote(id);
    setShowNoteModal(false);
  }

  const taskStatuses = useMemo(() => {
    return statusOrder.map((status) => {
      const items = tasks.filter((t) => t.status === status);
      const pausedCount = items.filter((t) => isTaskPaused(t, tasks)).length;
      return {
        id: status,
        label: statusMeta[status].label,
        count: items.length,
        pausedCount,
        color: statusMeta[status].color,
      };
    });
  }, [tasks]);

  const reminders = useMemo(() => {
    const paused = tasks
      .filter((t) => isTaskPaused(t, tasks))
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        until: t.blocked?.until,
        overdue: isTaskOverdue(t),
      }))
      .sort((a, b) => (a.until ?? 0) - (b.until ?? 0));

    return paused.slice(0, 5);
  }, [tasks]);

  const controlItems = useMemo(
    () => [
      {
        id: 'idea',
        icon: <Lightbulb size={20} />,
        label: 'Идея',
        color: statusMeta.idea.color,
      },
      {
        id: 'planned',
        icon: <ClipboardList size={20} />,
        label: 'План',
        color: statusMeta.planned.color,
      },
      {
        id: 'progress',
        icon: <Settings size={20} />,
        label: 'Процесс',
        color: statusMeta.progress.color,
      },
      {
        id: 'done',
        icon: <BadgeCheck size={20} />,
        label: 'Готово',
        color: statusMeta.done.color,
      },

      // умная "Пауза"
      {
        id: 'paused',
        icon: <CirclePause size={20} />,
        label: 'Пауза',
        color: '#111827',
      },

      { id: 'add', icon: <Plus size={20} />, label: 'Новая', color: '#3B82F6' },
    ],
    []
  );

  const sidebarItems = [
    {
      id: 'tasks',
      icon: <CheckSquare2 size={18} />,
      label: 'Задачи',
      active: activeSection === 'tasks',
      count: tasks.length,
    },
    {
      id: 'notes',
      icon: <NotebookText size={18} />,
      label: 'Примечания',
      active: activeSection === 'notes',
      count: notes.length,
    },
    {
      id: 'calendar',
      icon: <CalendarDays size={18} />,
      label: 'Календарь',
      active: activeSection === 'calendar',
      count: 0,
    },
    {
      id: 'projects',
      icon: <BarChart3 size={18} />,
      label: 'Проекты',
      active: activeSection === 'projects',
      count: 0,
    },
    {
      id: 'team',
      icon: <Users size={18} />,
      label: 'Команда',
      active: activeSection === 'team',
      count: 0,
    },
  ];

  const onControlClick = (id: string) => {
    if (id === 'add') {
      setShowNewTaskModal(true);
      return;
    }

    if (id === 'paused') {
      setActiveSection('tasks');
      setActiveStatusFilter(null);
      setPausedOnly((p) => !p);
      requestAnimationFrame(() => {
        columnRefs.current['progress']?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'start',
        });
      });
      return;
    }

    const isStatus = (statusOrder as string[]).includes(id);
    if (!isStatus) return;

    const s = id as Status;
    setActiveSection('tasks');
    setPausedOnly(false);

    // toggle filter
    setActiveStatusFilter((prev) => (prev === s ? null : s));

    // scroll to column
    requestAnimationFrame(() => {
      columnRefs.current[s]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'start',
      });
    });
  };

  const onReminderClick = (taskId: string) => {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;

    setActiveSection('tasks');
    setPausedOnly(false);
    setActiveStatusFilter(null);

    setSelectedTaskId(taskId);
    window.setTimeout(() => setSelectedTaskId(null), 1400);

    requestAnimationFrame(() => {
      columnRefs.current[t.status]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'start',
      });
    });
  };

  const boardStatuses = taskStatuses.filter((s) =>
    activeStatusFilter ? s.id === activeStatusFilter : true
  );

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
      }}
    >
      <SidebarGlass
        title="Мое рабочее пространство"
        subtitle={`${tasks.length} задач · ${notes.length} заметок`}
        items={sidebarItems.map((i) => ({
          ...i,
          onClick: () => setActiveSection(i.id as any),
        }))}
        reminders={reminders.map((r) => ({
          id: r.id,
          title: r.title,
          untilText: r.until ? formatUntil(r.until) : 'без даты',
          overdue: r.overdue,
          statusLabel: statusMeta[r.status].label,
        }))}
        onReminderClick={onReminderClick}
        controlItems={controlItems}
        onControlClick={onControlClick}
      />

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Top Bar */}
        <div
          style={{
            padding: '20px 32px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.5)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 700,
                color: 'var(--lg-text)',
              }}
            >
              {activeSection === 'tasks' && 'Задачи'}
              {activeSection === 'notes' && 'Примечания'}
              {activeSection === 'calendar' && 'Календарь'}
              {activeSection === 'projects' && 'Проекты'}
              {activeSection === 'team' && 'Команда'}
            </h1>

            {activeSection === 'tasks' && pausedOnly && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--lg-text-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(0,0,0,0.06)',
                }}
              >
                <Bell size={14} />
                На паузе
              </span>
            )}
          </div>

          <button
            onClick={() => setShowNewTaskModal(true)}
            className="lg-button lg-primary"
          >
            + Новая задача
          </button>
        </div>

        {/* Content based on active section */}
        {activeSection === 'tasks' && (
          <div
            style={{
              flex: 1,
              padding: '24px 32px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
              overflowY: 'auto',
            }}
          >
            {boardStatuses.map((status) => (
              <LiquidGlassSurface
                key={status.id}
                size="md"
                interactive={false}
                style={{ padding: '20px', minHeight: 'fit-content' }}
                ref={(el) => {
                  columnRefs.current[status.id] = el;
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: status.color,
                      letterSpacing: '-0.3px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {status.label}
                  </div>

                  {status.pausedCount > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: 'var(--lg-text-secondary)',
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: 'rgba(0,0,0,0.06)',
                      }}
                      title="Есть задачи на паузе"
                    >
                      ⏳ {status.pausedCount}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 700,
                    color: status.color,
                    marginBottom: 16,
                  }}
                >
                  {status.count}
                </div>

                {/* Task Items */}
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {tasks
                    .filter((t) => t.status === status.id)
                    .filter((t) => (pausedOnly ? isTaskPaused(t, tasks) : true))
                    .map((task) => {
                      const paused = isTaskPaused(task, tasks);
                      const overdue = isTaskOverdue(task);
                      const isSelected = selectedTaskId === task.id;

                      return (
                        <div
                          key={task.id}
                          style={{
                            padding: '12px',
                            borderRadius: 'var(--lg-radius-sm)',
                            background: paused
                              ? 'rgba(255,255,255,0.18)'
                              : 'rgba(255,255,255,0.15)',
                            border: `2px solid ${status.color}`,
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--lg-text)',
                            cursor: 'pointer',
                            transition:
                              'all var(--lg-duration-fast) var(--lg-easing)',
                            animation:
                              'slideInTask 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                            boxShadow: isSelected
                              ? '0 14px 40px rgba(0,0,0,0.12)'
                              : 'none',
                            opacity: paused ? 0.92 : 1,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = isSelected
                              ? 'scale(1.02)'
                              : 'translateX(4px)';
                            e.currentTarget.style.background =
                              'rgba(255,255,255,0.25)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = isSelected
                              ? 'scale(1.02)'
                              : 'translateX(0)';
                            e.currentTarget.style.background = paused
                              ? 'rgba(255,255,255,0.18)'
                              : 'rgba(255,255,255,0.15)';
                          }}
                          onClick={() => {
                            setEditingTaskId(task.id);
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                            }}
                          >
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {task.title}
                            </span>

                            {paused && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  background: overdue
                                    ? 'rgba(239,68,68,0.14)'
                                    : 'rgba(0,0,0,0.06)',
                                  color: overdue
                                    ? '#EF4444'
                                    : 'var(--lg-text-secondary)',
                                  whiteSpace: 'nowrap',
                                }}
                                title={task.blocked?.reason || 'На паузе'}
                              >
                                ⏳{' '}
                                {task.blocked?.until
                                  ? formatUntil(task.blocked.until)
                                  : 'пауза'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </LiquidGlassSurface>
            ))}
          </div>
        )}

        {activeSection === 'calendar' && (
          <div
            style={{ flex: 1, padding: '24px 32px', display: 'flex', gap: 24 }}
          >
            {/* Календарь слева */}
            <div style={{ flex: '0 0 380px' }}>
              <SimpleCalendar
                selectedDate={selectedCalendarDate || undefined}
                onDateSelect={(date) => {
                  setSelectedCalendarDate(date);
                }}
                highlightedDates={tasks
                  .filter((t) => t.blocked?.until)
                  .map((t) => new Date(t.blocked!.until!))}
              />
            </div>

            {/* Задачи по дате справа */}
            <div style={{ flex: 1 }}>
              {selectedCalendarDate ? (
                <div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: 'var(--lg-text)',
                      marginBottom: 16,
                    }}
                  >
                    {selectedCalendarDate.toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      weekday: 'long',
                    })}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    {tasks
                      .filter((t) => {
                        const tDate = new Date(t.createdAt || 0);
                        const sDate = selectedCalendarDate;
                        return (
                          tDate.getFullYear() === sDate.getFullYear() &&
                          tDate.getMonth() === sDate.getMonth() &&
                          tDate.getDate() === sDate.getDate()
                        );
                      })
                      .map((task) => (
                        <LiquidGlassSurface
                          key={task.id}
                          size="md"
                          interactive={false}
                          style={{
                            padding: 14,
                            background: isTaskPaused(task, tasks)
                              ? 'rgba(255,255,255,0.2)'
                              : 'rgba(255,255,255,0.15)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'baseline',
                              gap: 10,
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                                {task.title}
                              </div>
                              <div style={{ fontSize: 11, opacity: 0.7 }}>
                                {statusMeta[task.status].label}
                                {isTaskPaused(task, tasks) && ` • ⏳ На паузе`}
                              </div>
                            </div>
                            <button
                              className="lg-button"
                              onClick={() => setEditingTaskId(task.id)}
                              style={{ fontSize: 12, padding: '6px 10px' }}
                            >
                              Редактировать
                            </button>
                          </div>
                        </LiquidGlassSurface>
                      ))}

                    {tasks.filter((t) => {
                      const tDate = new Date(t.createdAt || 0);
                      const sDate = selectedCalendarDate;
                      return (
                        tDate.getFullYear() === sDate.getFullYear() &&
                        tDate.getMonth() === sDate.getMonth() &&
                        tDate.getDate() === sDate.getDate()
                      );
                    }).length === 0 && (
                      <LiquidGlassSurface
                        size="md"
                        interactive={false}
                        style={{ padding: 14 }}
                      >
                        <div style={{ opacity: 0.7, fontSize: 13 }}>
                          В этот день нет задач.
                        </div>
                      </LiquidGlassSurface>
                    )}
                  </div>
                </div>
              ) : (
                <LiquidGlassSurface
                  size="md"
                  interactive={false}
                  style={{ padding: 20 }}
                >
                  <div style={{ opacity: 0.7 }}>Выбери дату в календаре.</div>
                </LiquidGlassSurface>
              )}
            </div>
          </div>
        )}

        {activeSection === 'notes' && (
          <div style={{ flex: 1, padding: '24px 32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Можно привязывать заметку к задаче — удобно для контекста.
              </div>
              <button className="lg-button lg-primary" onClick={() => openNewNote()}>
                + Новая заметка
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <AnimatePresence initial={false}>
                {notes.map((n) => {
                  const taskTitle = n.taskId ? tasks.find(t => t.id === n.taskId)?.title : null;

                  return (
                    <motion.div
                      key={n.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.18 }}
                    >
                      <LiquidGlassSurface size="md" interactive={false} style={{ padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                          <div style={{ fontWeight: 800 }}>{n.title}</div>
                          <button className="lg-button" onClick={() => { setEditingNoteId(n.id); setShowNoteModal(true); }}>
                            Открыть
                          </button>
                        </div>

                        {taskTitle && (
                          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
                            Привязка: {taskTitle}
                          </div>
                        )}

                        {n.body && (
                          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85, whiteSpace: 'pre-wrap' }}>
                            {n.body.length > 220 ? n.body.slice(0, 220) + '…' : n.body}
                          </div>
                        )}
                      </LiquidGlassSurface>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {notes.length === 0 && (
                <LiquidGlassSurface size="md" interactive={false} style={{ padding: 16 }}>
                  <div style={{ opacity: 0.7 }}>Заметок пока нет — создай первую.</div>
                </LiquidGlassSurface>
              )}
            </div>
          </div>
        )}

        {activeSection === 'projects' && <ProjectsPage />}

        {activeSection === 'team' && <TeamPage />}
      </div>

      {/* New Task Modal */}
      {showNewTaskModal && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowNewTaskModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            background: 'rgba(0,0,0,0.18)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
        >
          <div
            className="lg-surface lg-md"
            style={{ width: 460, maxWidth: '100%' }}
          >
            <div className="lg-surface-content" style={{ padding: 16 }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>
                Новая задача
              </div>

              <label style={{ fontSize: 12, opacity: 0.7 }}>Название</label>
              <input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Например: Сделать дизайн панели"
                autoFocus
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '12px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.08)',
                  outline: 'none',
                  background: 'rgba(255,255,255,0.55)',
                }}
              />

              <label
                style={{
                  fontSize: 12,
                  opacity: 0.7,
                  display: 'block',
                  marginTop: 12,
                }}
              >
                Статус
              </label>
              <select
                value={newTaskStatus}
                onChange={(e) => setNewTaskStatus(e.target.value as Status)}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '12px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.08)',
                  background: 'rgba(255,255,255,0.55)',
                }}
              >
                <option value="idea">Идея</option>
                <option value="planned">Запланировано</option>
                <option value="progress">В процессе</option>
                <option value="done">Готово</option>
              </select>

              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.22)',
                  border: '1px solid rgba(0,0,0,0.06)',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newTaskPaused}
                    onChange={(e) => setNewTaskPaused(e.target.checked)}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    Поставить на паузу
                  </span>
                </label>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>Жду до</div>
                    <input
                      type="datetime-local"
                      value={newTaskUntil}
                      onChange={(e) => setNewTaskUntil(e.target.value)}
                      style={{
                        width: '100%',
                        marginTop: 6,
                        padding: '10px 10px',
                        borderRadius: 12,
                        border: '1px solid rgba(0,0,0,0.08)',
                        outline: 'none',
                        background: 'rgba(255,255,255,0.55)',
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>Причина</div>
                    <input
                      value={newTaskReason}
                      onChange={(e) => setNewTaskReason(e.target.value)}
                      placeholder="Жду ответ / доступ / деньги…"
                      style={{
                        width: '100%',
                        marginTop: 6,
                        padding: '10px 10px',
                        borderRadius: 12,
                        border: '1px solid rgba(0,0,0,0.08)',
                        outline: 'none',
                        background: 'rgba(255,255,255,0.55)',
                      }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: 11, opacity: 0.65, marginTop: 8 }}>
                  Даже если ты не ставишь галочку, задача станет "на паузе",
                  если задана дата "Жду до" или причина.
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  marginTop: 14,
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  className="lg-button"
                  onClick={() => setShowNewTaskModal(false)}
                >
                  Отмена
                </button>
                <button className="lg-button lg-primary" onClick={createTask}>
                  Создать
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingTaskId(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            background: 'rgba(0,0,0,0.18)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
        >
          <div
            className="lg-surface lg-md"
            style={{ width: 520, maxWidth: '100%' }}
          >
            <div className="lg-surface-content" style={{ padding: 16 }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>
                Редактирование
              </div>

              <label style={{ fontSize: 12, opacity: 0.7 }}>Название</label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Название задачи"
                autoFocus
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '12px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.08)',
                  outline: 'none',
                  background: 'rgba(255,255,255,0.55)',
                }}
              />

              <label
                style={{
                  fontSize: 12,
                  opacity: 0.7,
                  display: 'block',
                  marginTop: 12,
                }}
              >
                Статус
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as Status)}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '12px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.08)',
                  background: 'rgba(255,255,255,0.55)',
                }}
              >
                <option value="idea">Идея</option>
                <option value="planned">Запланировано</option>
                <option value="progress">В процессе</option>
                <option value="done">Готово</option>
              </select>

              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.22)',
                  border: '1px solid rgba(0,0,0,0.06)',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={editPaused}
                    onChange={(e) => setEditPaused(e.target.checked)}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    На паузе
                  </span>
                </label>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>Жду до</div>
                    <input
                      type="datetime-local"
                      value={editUntil}
                      onChange={(e) => setEditUntil(e.target.value)}
                      style={{
                        width: '100%',
                        marginTop: 6,
                        padding: '10px 10px',
                        borderRadius: 12,
                        border: '1px solid rgba(0,0,0,0.08)',
                        outline: 'none',
                        background: 'rgba(255,255,255,0.55)',
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>Причина</div>
                    <input
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Жду ответ / доступ / ревью…"
                      style={{
                        width: '100%',
                        marginTop: 6,
                        padding: '10px 10px',
                        borderRadius: 12,
                        border: '1px solid rgba(0,0,0,0.08)',
                        outline: 'none',
                        background: 'rgba(255,255,255,0.55)',
                      }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: 11, opacity: 0.65, marginTop: 8 }}>
                  Сними паузу и очисти дату/причину — задача снова "нормальная".
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800, marginBottom: 8 }}>
                  Подпункты
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    value={newSubtaskText}
                    onChange={(e) => setNewSubtaskText(e.target.value)}
                    placeholder="Например: Сайт — сверстать главную"
                    style={{
                      flex: 1,
                      padding: '10px 10px',
                      borderRadius: 12,
                      border: '1px solid rgba(0,0,0,0.08)',
                      outline: 'none',
                      background: 'rgba(255,255,255,0.55)',
                    }}
                  />
                  <button
                    className="lg-button lg-primary"
                    onClick={() => {
                      addSubtask(editingTask.id, newSubtaskText);
                      setNewSubtaskText('');
                    }}
                  >
                    Добавить
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  <AnimatePresence initial={false}>
                    {editingTask.subtasks.map((s) => (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 10px',
                          borderRadius: 12,
                          background: 'rgba(255,255,255,0.18)',
                          border: '1px solid rgba(0,0,0,0.06)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={s.done}
                          onChange={() => toggleSubtask(editingTask.id, s.id)}
                        />
                        <div style={{ flex: 1, fontSize: 12, fontWeight: 650, opacity: s.done ? 0.55 : 1 }}>
                          {s.text}
                        </div>
                        <button
                          className="lg-button"
                          onClick={() => deleteSubtask(editingTask.id, s.id)}
                          style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          aria-label="Удалить подпункт"
                        >
                          <Trash2 size={14} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  marginTop: 14,
                  justifyContent: 'space-between',
                }}
              >
                <button
                  className="lg-button"
                  onClick={() => deleteTaskLocal(editingTask.id)}
                  style={{
                    background: 'rgba(239,68,68,0.14)',
                    borderColor: 'rgba(239,68,68,0.25)',
                    color: '#EF4444',
                  }}
                >
                  Удалить
                </button>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="lg-button"
                    onClick={() => setEditingTaskId(null)}
                  >
                    Отмена
                  </button>
                  <button className="lg-button" onClick={() => openNewNote(editingTask.id)}>
                    + Заметка к задаче
                  </button>
                  <button
                    className="lg-button"
                    onClick={() => finishTask(editingTask.id)}
                  >
                    Завершить
                  </button>
                  <button className="lg-button lg-primary" onClick={saveEdit}>
                    Сохранить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInTask {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Note Modal */}
      {showNoteModal && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowNoteModal(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            background: 'rgba(0,0,0,0.18)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
        >
          <div className="lg-surface lg-md" style={{ width: 560, maxWidth: '100%' }}>
            <div className="lg-surface-content" style={{ padding: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>
                {editingNoteId ? 'Редактирование заметки' : 'Новая заметка'}
              </div>

              <label style={{ fontSize: 12, opacity: 0.7 }}>Заголовок</label>
              <input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Например: Идеи по UI"
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '12px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.08)',
                  outline: 'none',
                  background: 'rgba(255,255,255,0.55)',
                }}
              />

              <label style={{ fontSize: 12, opacity: 0.7, display: 'block', marginTop: 12 }}>
                Привязать к задаче
              </label>
              <select
                value={noteTaskId}
                onChange={(e) => setNoteTaskId(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '12px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.08)',
                  background: 'rgba(255,255,255,0.55)',
                }}
              >
                <option value="">Без привязки</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>

              <label style={{ fontSize: 12, opacity: 0.7, display: 'block', marginTop: 12 }}>
                Текст
              </label>
              <textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Пиши мысли, ссылки, требования…"
                rows={8}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '12px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.08)',
                  outline: 'none',
                  background: 'rgba(255,255,255,0.55)',
                  resize: 'vertical',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
                {editingNoteId ? (
                  <button
                    className="lg-button"
                    onClick={() => deleteNoteLocal(editingNoteId)}
                    style={{ background: 'rgba(239,68,68,0.14)', borderColor: 'rgba(239,68,68,0.25)', color: '#EF4444' }}
                  >
                    Удалить
                  </button>
                ) : (
                  <div />
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="lg-button" onClick={() => setShowNoteModal(false)}>
                    Отмена
                  </button>
                  <button className="lg-button lg-primary" onClick={saveNote}>
                    Сохранить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
