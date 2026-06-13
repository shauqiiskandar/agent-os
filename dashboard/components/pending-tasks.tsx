"use client";

import { useState, useEffect, useCallback } from "react";
import type { PendingTask } from "@/lib/types";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";
import { generateId } from "@/lib/utils";

export function PendingTasks() {
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pending");
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (updated: PendingTask[]) => {
    setTasks(updated);
    await fetch("/api/pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: updated }),
    });
  };

  const toggle = (id: string) => {
    save(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const remove = (id: string) => {
    save(tasks.filter((t) => t.id !== id));
  };

  const add = () => {
    if (!newText.trim()) return;
    save([...tasks, { id: generateId(), text: newText.trim(), done: false }]);
    setNewText("");
  };

  const clearDone = () => {
    save(tasks.filter((t) => !t.done));
  };

  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div className="flex h-full flex-col overflow-y-auto animate-fade-in">
      <div className="mb-6">
        <h2 className="font-sans text-lg font-semibold text-text">Pending Tasks</h2>
        <p className="mt-1 text-sm text-text-dim">
          Tasks pulled from global memory. Check off items as you complete them.
        </p>
      </div>

      {/* Add task */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a new task..."
          className="flex-1 rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
        <button
          onClick={add}
          disabled={!newText.trim()}
          className="rounded-md bg-accent px-4 py-2 font-mono text-xs font-medium text-bg hover:bg-accent/90 transition-colors disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-shimmer rounded-md" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-lg border border-border bg-bg-elev p-8 text-center">
          <Icon name="pending" className="mx-auto h-8 w-8 text-text-faint" />
          <p className="mt-2 text-sm text-text-dim">No pending tasks</p>
          <p className="mt-1 font-mono text-[10px] text-text-faint">
            Add a task above or populate pending.txt
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {pending.map((task) => (
            <TaskItem key={task.id} task={task} onToggle={toggle} onRemove={remove} />
          ))}
          {done.length > 0 && (
            <>
              <div className="my-3 flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="font-mono text-[10px] text-text-faint">
                  {done.length} completed
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              {done.map((task) => (
                <TaskItem key={task.id} task={task} onToggle={toggle} onRemove={remove} />
              ))}
              <button
                onClick={clearDone}
                className="mt-2 font-mono text-[10px] text-text-faint hover:text-red transition-colors"
              >
                Clear completed
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TaskItem({
  task,
  onToggle,
  onRemove,
}: {
  task: PendingTask;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-md border border-transparent px-3 py-2 transition-colors hover:bg-bg-elev-2",
        task.done && "opacity-50"
      )}
    >
      <button
        onClick={() => onToggle(task.id)}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
          task.done
            ? "border-accent bg-accent text-bg"
            : "border-border text-transparent hover:border-accent"
        )}
        aria-label={task.done ? "Mark incomplete" : "Mark complete"}
      >
        {task.done && <Icon name="check" className="h-3 w-3" />}
      </button>
      <span
        className={cn(
          "flex-1 text-sm text-text",
          task.done && "line-through text-text-faint"
        )}
      >
        {task.text}
      </span>
      <button
        onClick={() => onRemove(task.id)}
        className="opacity-0 group-hover:opacity-100 text-text-faint hover:text-red transition-all"
        aria-label="Delete task"
      >
        <Icon name="x" className="h-3 w-3" />
      </button>
    </div>
  );
}
