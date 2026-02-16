'use client';

import { ReactNode, Children, isValidElement } from 'react';

function extractSelectItems(node: ReactNode): { value: string; label: ReactNode }[] {
  const items: { value: string; label: ReactNode }[] = [];
  function walk(n: ReactNode) {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (isValidElement(n) && n.type === SelectItem) {
      const { value, children } = (n.props as { value?: string; children?: ReactNode }) || {};
      if (value !== undefined) {
        items.push({ value, label: children ?? value });
      }
      return;
    }
    const props = n && typeof n === 'object' && 'props' in n ? (n as { props?: { children?: ReactNode } }).props : undefined;
    if (props?.children) {
      walk(props.children);
    }
  }
  walk(node);
  return items;
}

function extractTriggerClassName(node: ReactNode): string {
  let className = '';
  function walk(n: ReactNode) {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (isValidElement(n) && n.type === SelectTrigger) {
      className = ((n.props as { className?: string })?.className ?? '').toString();
      return;
    }
    const props = n && typeof n === 'object' && 'props' in n ? (n as { props?: { children?: ReactNode } }).props : undefined;
    if (props?.children) {
      walk(props.children);
    }
  }
  walk(node);
  return className;
}

export function Select({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  children: ReactNode;
}) {
  const items = extractSelectItems(children);
  const triggerClass = extractTriggerClassName(children);
  return (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={`inline-flex w-full items-center justify-between rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white ${triggerClass}`.trim()}
    >
      {items.map((i) => (
        <option key={i.value} value={i.value}>
          {i.label}
        </option>
      ))}
    </select>
  );
}

export function SelectTrigger({
  children,
  className = '',
}: { children?: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  return null;
}

export function SelectContent({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SelectItem({ value, children }: { value: string; children: ReactNode }) {
  return <option value={value}>{children}</option>;
}
SelectItem.displayName = 'SelectItem';
