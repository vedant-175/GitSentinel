export interface ExpectedIssue {
    filePath: string;
    startLine: number;
    endLine: number;
    category: 'bug' | 'security' | 'style' | 'performance' | 'maintainability';
    severity: 'critical' | 'warning' | 'suggestion';
    description?: string;
}
export interface LabeledDiff {
    id: string;
    name: string;
    filePath: string;
    hasBug: boolean;
    isInjection: boolean;
    isHistorical: boolean;
    isHeldOut: boolean;
    language: string;
    patch: string;
    expectedIssues: ExpectedIssue[];
}
export declare const LABELED_DIFFS: LabeledDiff[];
//# sourceMappingURL=dataset.d.ts.map