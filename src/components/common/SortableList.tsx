import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface DragHandleProps {
  ref: (el: HTMLElement | null) => void
  listeners: DraggableSyntheticListeners
  attributes: Record<string, unknown>
}

interface SortableListProps<T> {
  items: T[]
  getId: (item: T) => string
  onReorder: (items: T[]) => void
  disabled?: boolean
  renderItem: (item: T, index: number, handle: DragHandleProps) => ReactNode
  className?: string
}

/** Vertical list reordered by dragging a handle (touch, mouse, or keyboard: space + arrows). */
export function SortableList<T>({ items, getId, onReorder, disabled, renderItem, className }: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => getId(i) === active.id)
    const to = items.findIndex((i) => getId(i) === over.id)
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map(getId)} strategy={verticalListSortingStrategy} disabled={disabled}>
        <ul className={className}>
          {items.map((item, index) => (
            <SortableRow key={getId(item)} id={getId(item)}>
              {(handle) => renderItem(item, index, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ id, children }: { id: string; children: (handle: DragHandleProps) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative bg-card', isDragging && 'z-10 rounded-xl shadow-lg ring-1 ring-ring')}
    >
      {children({ ref: setActivatorNodeRef, listeners, attributes: attributes as unknown as Record<string, unknown> })}
    </li>
  )
}
