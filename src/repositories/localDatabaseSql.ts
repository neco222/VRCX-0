import type { SQLiteParams, SQLiteValue } from './sqliteRepository.js';

type SqlRow = Record<string, unknown>;
type SqlColumnSpec =
    | string
    | {
          column: string;
          value?: string | ((row: SqlRow) => SQLiteValue);
      };

interface InClauseResult {
    clause: string;
    args: Exclude<SQLiteParams, null | SQLiteValue[]>;
}

interface ValuesListResult {
    valuesSql: string;
    args: Exclude<SQLiteParams, null | SQLiteValue[]>;
}

function safeParameterPart(value: unknown): string {
    return String(value || 'value').replace(/[^A-Za-z0-9_]/g, '_');
}

function buildInClause(
    column: string,
    values: SQLiteValue[],
    prefix = 'in'
): InClauseResult {
    if (!Array.isArray(values) || values.length === 0) {
        return { clause: '', args: {} };
    }

    const args: InClauseResult['args'] = {};
    const safePrefix = safeParameterPart(prefix);
    const placeholders = values.map((value, index) => {
        const key = `@${safePrefix}_${index}`;
        args[key] = value;
        return key;
    });

    return {
        clause: `${column} IN (${placeholders.join(', ')})`,
        args
    };
}

function columnNameFor(columnSpec: SqlColumnSpec): string {
    return typeof columnSpec === 'string' ? columnSpec : columnSpec.column;
}

function valueFor(row: SqlRow, columnSpec: SqlColumnSpec): SQLiteValue {
    if (typeof columnSpec === 'string') {
        return row[columnSpec] as SQLiteValue;
    }
    if (typeof columnSpec.value === 'function') {
        return columnSpec.value(row);
    }
    return row[columnSpec.value ?? columnSpec.column] as SQLiteValue;
}

function buildValuesList(
    rows: SqlRow[],
    columns: SqlColumnSpec[],
    prefix = 'value'
): ValuesListResult {
    if (!Array.isArray(rows) || rows.length === 0) {
        return { valuesSql: '', args: {} };
    }
    if (!Array.isArray(columns) || columns.length === 0) {
        return { valuesSql: '', args: {} };
    }

    const args: ValuesListResult['args'] = {};
    const safePrefix = safeParameterPart(prefix);
    const valuesSql = rows
        .map((row, rowIndex) => {
            const placeholders = columns.map((columnSpec, columnIndex) => {
                const key = `@${safePrefix}_${safeParameterPart(columnNameFor(columnSpec))}_${rowIndex}_${columnIndex}`;
                args[key] = valueFor(row, columnSpec);
                return key;
            });
            return `(${placeholders.join(', ')})`;
        })
        .join(', ');

    return { valuesSql, args };
}

function clampSqlLimit(value: unknown, fallback = 500, max = 50000): number {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.min(parsed, max);
}

export { buildInClause, buildValuesList, clampSqlLimit };
