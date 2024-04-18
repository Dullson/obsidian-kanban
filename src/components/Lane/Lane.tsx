import animateScrollTo from 'animated-scroll-to';
import classcat from 'classcat';
import update from 'immutability-helper';
import { Fragment, memo, useCallback, useContext, useMemo, useRef, useState } from 'preact/compat';
import {
  DraggableProps,
  Droppable,
  StaticDroppable,
  useNestedEntityPath,
} from 'src/dnd/components/Droppable';
import { ScrollContainer } from 'src/dnd/components/ScrollContainer';
import { SortPlaceholder } from 'src/dnd/components/SortPlaceholder';
import { Sortable, StaticSortable } from 'src/dnd/components/Sortable';
import { useDragHandle } from 'src/dnd/managers/DragManager';
import { frontmatterKey } from 'src/parsers/common';

import { Items } from '../Item/Item';
import { ItemForm } from '../Item/ItemForm';
import { KanbanContext, SearchContext } from '../context';
import { c, generateInstanceId } from '../helpers';
import { DataTypes, EditState, EditingState, Item, Lane } from '../types';
import { LaneHeader } from './LaneHeader';

const laneAccepts = [DataTypes.Item];

export interface DraggableLaneProps {
  lane: Lane;
  laneIndex: number;
  isStatic?: boolean;
  collapseDir: 'horizontal' | 'vertical';
  forceCollapse?: boolean;
}

function DraggableLaneRaw({
  isStatic,
  lane,
  laneIndex,
  collapseDir,
  forceCollapse,
}: DraggableLaneProps) {
  const [editState, setEditState] = useState<EditState>(EditingState.cancel);
  const [isSorting, setIsSorting] = useState(false);

  const { stateManager, boardModifiers, view } = useContext(KanbanContext);
  const search = useContext(SearchContext);

  const boardView = stateManager.useSetting(frontmatterKey);
  const path = useNestedEntityPath(laneIndex);
  const laneWidth = stateManager.useSetting('lane-width');
  const fullWidth = boardView === 'list' && stateManager.useSetting('full-list-lane-width');
  const insertionMethod = stateManager.useSetting('new-card-insertion-method');
  const laneStyles = useMemo(
    () => (fullWidth || laneWidth ? { width: fullWidth ? '100%' : `${laneWidth}px` } : undefined),
    [fullWidth, laneWidth]
  );

  const elementRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  useDragHandle(measureRef, dragHandleRef);

  const shouldMarkItemsComplete = !!lane.data.shouldMarkItemsComplete;
  const isCollapsed = !!lane.data.isCollapsed || !!forceCollapse;
  const isCompactPrepend = insertionMethod === 'prepend-compact';
  const shouldPrepend = isCompactPrepend || insertionMethod === 'prepend';

  const toggleIsCollapsed = useCallback(() => {
    boardModifiers.updateLane(
      path,
      update(lane, {
        data: {
          $toggle: ['isCollapsed'],
        },
      })
    );
  }, [path, lane, boardModifiers]);

  const addItems = useCallback(
    (items: Item[]) => {
      boardModifiers[shouldPrepend ? 'prependItems' : 'appendItems'](
        [...path, lane.children.length - 1],
        items.map((item) =>
          update(item, {
            data: {
              isComplete: {
                // Mark the item complete if we're moving into a completed lane
                $set: shouldMarkItemsComplete,
              },
            },
          })
        )
      );

      // TODO: can we find a less brute force way to do this?
      view.getWindow().setTimeout(() => {
        const laneItems = elementRef.current?.getElementsByClassName(c('lane-items'));

        if (laneItems.length) {
          animateScrollTo([0, shouldPrepend ? 0 : laneItems[0].scrollHeight], {
            elementToScroll: laneItems[0],
            speed: 200,
            minDuration: 150,
            easing: (x: number) => {
              return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
            },
          });
        }
      });
    },
    [boardModifiers, path, lane, shouldPrepend]
  );

  const DroppableComponent = isStatic ? StaticDroppable : Droppable;
  const SortableComponent = isStatic ? StaticSortable : Sortable;
  const CollapsedDropArea = !isCollapsed || isStatic ? Fragment : Droppable;
  const dropAreaProps: DraggableProps = useMemo(() => {
    if (!isCollapsed || isStatic) return {} as any;
    const data = {
      id: generateInstanceId(),
      type: 'lane',
      accepts: [DataTypes.Item],
      acceptsSort: [DataTypes.Lane],
    };
    return {
      elementRef: elementRef,
      measureRef: measureRef,
      id: data.id,
      index: laneIndex,
      data: data,
    };
  }, [isCollapsed, laneIndex, isStatic]);

  return (
    <div
      ref={measureRef}
      className={classcat([
        c('lane-wrapper'),
        {
          'is-sorting': isSorting,
          'collapse-horizontal': isCollapsed && collapseDir === 'horizontal',
          'collapse-vertical': isCollapsed && collapseDir === 'vertical',
        },
      ])}
      style={laneStyles}
    >
      <div
        data-count={lane.children.length}
        ref={elementRef}
        className={classcat([c('lane'), { 'will-prepend': shouldPrepend }])}
      >
        <CollapsedDropArea {...dropAreaProps}>
          <LaneHeader
            dragHandleRef={dragHandleRef}
            laneIndex={laneIndex}
            lane={lane}
            setIsItemInputVisible={isCompactPrepend ? setEditState : undefined}
            isCollapsed={isCollapsed}
            toggleIsCollapsed={toggleIsCollapsed}
          />

          {!search?.query && !isCollapsed && shouldPrepend && (
            <ItemForm
              addItems={addItems}
              hideButton={isCompactPrepend}
              editState={editState}
              setEditState={setEditState}
            />
          )}

          {!isCollapsed && (
            <DroppableComponent
              elementRef={elementRef}
              measureRef={measureRef}
              id={lane.id}
              index={laneIndex}
              data={lane}
            >
              <ScrollContainer
                className={classcat([c('lane-items'), c('vertical')])}
                id={lane.id}
                index={laneIndex}
                isStatic={isStatic}
                triggerTypes={laneAccepts}
              >
                <SortableComponent onSortChange={setIsSorting} axis="vertical">
                  <Items
                    items={lane.children}
                    isStatic={isStatic}
                    shouldMarkItemsComplete={shouldMarkItemsComplete}
                  />
                  <SortPlaceholder
                    accepts={laneAccepts}
                    index={lane.children.length}
                    isStatic={isStatic}
                  />
                </SortableComponent>
              </ScrollContainer>
            </DroppableComponent>
          )}

          {!search?.query && !isCollapsed && !shouldPrepend && (
            <ItemForm addItems={addItems} editState={editState} setEditState={setEditState} />
          )}
        </CollapsedDropArea>
      </div>
    </div>
  );
}

export const DraggableLane = memo(DraggableLaneRaw);

export interface LanesProps {
  lanes: Lane[];
  collapseDir: 'horizontal' | 'vertical';
}

function LanesRaw({ lanes, collapseDir }: LanesProps) {
  const search = useContext(SearchContext);
  const { stateManager } = useContext(KanbanContext);
  const view = stateManager.useSetting(frontmatterKey);

  return (
    <>
      {lanes.map((lane, i) => {
        return (
          <DraggableLane
            collapseDir={collapseDir}
            forceCollapse={search?.query && !search.lanes.has(lane)}
            key={view + lane.id}
            lane={lane}
            laneIndex={i}
          />
        );
      })}
    </>
  );
}

export const Lanes = memo(LanesRaw);
