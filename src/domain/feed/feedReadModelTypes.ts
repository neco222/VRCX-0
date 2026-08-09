export type FeedReadModelResult<TRow = Record<string, unknown>> = {
    rows: TRow[];
    maxSequence: number;
};
