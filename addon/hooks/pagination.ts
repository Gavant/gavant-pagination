import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { getOwner, setOwner } from '@ember/application';
import NativeArray from '@ember/array/-private/native-array';
import { tracked } from '@glimmer/tracking';
import { A } from '@ember/array';
import DS from 'ember-data';

import { buildQueryParams  } from '@gavant/ember-pagination/utils/query-params';

export type RecordArrayWithMeta<T> = DS.AdapterPopulatedRecordArray<T> & { meta: any };

export interface ResponseMetadata {
    totalCount: number;
}

export interface Sorting {
    valuePath: string;
    sortPath?: string;
    isAscending: boolean;
}

export interface PaginationArgs<T extends DS.Model, M = ResponseMetadata> {
    context: any;
    modelName: string;
    rows: NativeArray<T> | T[];
    metadata: M;
    limit?: number;
    filterList?: string[];
    includeList?: string[];
    sorts?: string[];
    pagingRootKey?: string | null;
    filterRootKey?: string | null;
    includeKey?: string;
    sortKey?: string;
    serverDateFormat?: string;
    processQueryParams?: (params: any) => any;
    onChangeSorting?: (sorts: string[], newSorts?: Sorting[]) => Promise<string[] | undefined> | void;
}

export class Pagination<T extends DS.Model, M = ResponseMetadata> {
    @service store!: DS.Store;

    context: any;
    modelName: string;
    limit: number = 20;
    filterList: string[] = [];
    includeList: string[] = [];
    sorts: string[] = [];

    pagingRootKey: string | null = 'page';
    filterRootKey: string | null = 'filter';
    includeKey: string = 'include';
    sortKey: string = 'sort';
    serverDateFormat: string = 'YYYY-MM-DDTHH:mm:ss';
    processQueryParams: (params: any) => any = (params: any) => params;
    onChangeSorting?: (sorts: string[], newSorts?: Sorting[]) => Promise<string[] | undefined> | void;

    @tracked rows: NativeArray<T> | T[] = A();
    @tracked metadata: M | undefined;
    @tracked hasMore: boolean = true;
    @tracked isLoading: boolean = false;

    get offset() {
        return this.rows.length;
    }

    constructor(args: PaginationArgs<T, M>) {
        this.modelName = args.context;
        this.setConfigs(args);
    }

    /**
     * Sets only pagination configs that are passed in the args
     * @param {PaginationArgs<T, M>} args
     */
    @action
    setConfigs(args: PaginationArgs<T, M>) {
        if(args.context !== undefined)              this.context = args.context;
        if(args.modelName !== undefined)            this.modelName = args.modelName;
        if(args.rows !== undefined)                 this.rows = A(args.rows);
        if(args.metadata !== undefined)             this.metadata = args.metadata;
        if(args.limit !== undefined)                this.limit = args.limit;
        if(args.filterList !== undefined)           this.filterList = args.filterList;
        if(args.includeList !== undefined)          this.includeList = args.includeList;
        if(args.sorts !== undefined)                this.sorts = args.sorts;
        if(args.pagingRootKey !== undefined)        this.pagingRootKey = args.pagingRootKey;
        if(args.filterRootKey !== undefined)        this.filterRootKey = args.filterRootKey;
        if(args.includeKey !== undefined)           this.includeKey = args.includeKey;
        if(args.includeKey !== undefined)           this.includeKey = args.includeKey;
        if(args.sortKey !== undefined)              this.sortKey = args.sortKey;
        if(args.serverDateFormat !== undefined)     this.serverDateFormat = args.serverDateFormat;
        if(args.processQueryParams !== undefined)   this.processQueryParams = args.processQueryParams;
        if(args.onChangeSorting !== undefined)      this.onChangeSorting = args.onChangeSorting;

        this.hasMore = this.rows.length >= this.limit;
    }

    @action
    async loadModels(reset = false) {
        if(reset) {
            this.clearModels();
        }

        const queryParams = buildQueryParams({
            context: this.context,
            offset: this.offset,
            limit: this.limit,
            filterList: this.filterList,
            includeList: this.includeList,
            sorts: this.sorts,
            pagingRootKey: this.pagingRootKey,
            filterRootKey: this.filterRootKey,
            includeKey: this.includeKey,
            sortKey: this.sortKey,
            serverDateFormat: this.serverDateFormat,
            processQueryParams: this.processQueryParams
        });

        try {
            this.isLoading = true;
            const result = await this.queryModels(queryParams);
            const rows = result.toArray();
            this.hasMore = rows.length >= this.limit;
            this.metadata = result.meta;
            this.rows.pushObjects(rows);
            return rows;
        } finally {
            this.isLoading = false;
        }
    }

    @action
    async queryModels(queryParams: any): Promise<RecordArrayWithMeta<T>> {
        //TODO if provided, call method that provides custom query records logic instead
        const results = await this.store.query(this.modelName, queryParams) as RecordArrayWithMeta<T>;
        return results;
    }

    @action
    loadMoreModels() {
        if (this.hasMore && !this.isLoading) {
            return this.loadModels();
        }

        return null;
    }

    @action
    reloadModels() {
        return this.loadModels(true);
    }

    @action
    filterModels() {
        return this.loadModels(true);
    }

    @action
    clearModels() {
        this.rows = A();
    }

    @action
    async changeSorting(newSorts: Sorting[]) {
        this.sorts = newSorts.map((col) =>
            `${!col.isAscending ? '-' : ''}${col.sortPath ?? col.valuePath}`
        );

        //allow the parent context to store and/or modify updates to sorts
        if(this.onChangeSorting) {
            const processedSorts = await this.onChangeSorting(this.sorts, newSorts);
            if(processedSorts) {
                this.sorts = processedSorts;
            }
        }

        return this.reloadModels();
    }

    @action
    reset() {
        this.clearModels();
        this.hasMore = true;
        this.isLoading = false;
    }
}

/**
 * Creates and returns a new Pagination instance and binds its owner to be the same as
 * that of its parent "context" (e.g. Controller, Component, etc).
 * In most cases, this returned instance should be assigned to a @tracked property
 * on its parent context, so that it can be accessed on the associated template
 * @param {PaginationArgs} args
 */
const usePagination = <T extends DS.Model, M = ResponseMetadata>(args: PaginationArgs<T, M>) => {
    const owner = getOwner(args.context);
    const paginator = new Pagination<T, M>(args)
    setOwner(paginator, owner)
    return paginator;
};

export default usePagination;
