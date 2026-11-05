import type { CellOverride as PreactCellOverride } from '@oracle/oraclejet-preact/UNSAFE_TableView';
import type { TableProps, TableDefaultColumnKey } from '../../table';
/**
 * This hook mirrors useCurrentItemOverride for ListView, but for Table cells.
 *
 * If the app provides a new value for 'currentCellOverride', we pass that down to
 * the preact TableView. Otherwise, we pass the internal override value, which
 * can be updated by useHandleRemoveCurrentKey when a row is removed.
 *
 * Additionally, we remember the last persisted current cell (rowKey + columnKey + type)
 * so that when a row is deleted, we can move current cell to the same column
 * in the next/previous row.
 */
export declare const useCurrentCellOverride: <K extends string | number, D, C extends string>(currentCellOverride: TableProps<K, D, C>["currentCellOverride"]) => {
    preactCurrentCellOverride: PreactCellOverride<K, C | "oj-c-table_selection"> | undefined;
    onCurrentRowOverride: (rowKey: K) => void;
    recordPersistedCell: (cell: PreactCellOverride<K, C | TableDefaultColumnKey>) => void;
};
