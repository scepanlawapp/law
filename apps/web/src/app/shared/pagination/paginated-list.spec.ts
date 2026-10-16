import { DestroyRef, signal } from "@angular/core";
import { Observable, Subject, of } from "rxjs";
import {
  DEFAULT_PAGE_SIZE,
  LocalPagination,
  PageRequest,
  PageResponse,
  PageState,
  PaginatedList,
} from "./paginated-list";

const SIZE = DEFAULT_PAGE_SIZE;

const response = <T>(
  items: T[],
  totalItems: number,
  pageSize = DEFAULT_PAGE_SIZE,
) => ({
  items,
  meta: { totalItems, totalPages: Math.ceil(totalItems / pageSize) },
});

function createList<T>(
  fetch: (request: PageRequest) => Observable<PageResponse<T>>,
  extra: { navigate?: (request: PageRequest) => void } = {},
) {
  const destroy: Array<() => void> = [];
  const destroyRef = {
    onDestroy: (callback: () => void) => destroy.push(callback),
  } as unknown as DestroyRef;
  const list = new PaginatedList<T>({ fetch, ...extra }, destroyRef);
  return { list, destroy: () => destroy.forEach((callback) => callback()) };
}

describe("PageState", () => {
  it("guards page and size changes and notifies the owner", () => {
    const onChange = jest.fn();
    const state = new PageState({ onChange });
    expect(state.pageSize()).toBe(DEFAULT_PAGE_SIZE);
    state.applyPage(1, { totalItems: 2 * SIZE + 20, totalPages: 3 });
    state.changePage(0);
    state.changePage(4);
    state.changePage(1);
    expect(onChange).not.toHaveBeenCalled();
    state.changePage(3);
    expect(onChange).toHaveBeenLastCalledWith({ page: 3, pageSize: SIZE });
    state.changePageSize(20);
    expect(onChange).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 });
  });

  it("ignores changes while loading and clamps past the last page", () => {
    const loading = signal(true);
    const onChange = jest.fn();
    const state = new PageState({ loading, onChange });
    state.applyPage(1, { totalItems: 4 * SIZE, totalPages: 4 });
    state.changePage(2);
    expect(onChange).not.toHaveBeenCalled();
    expect(state.applyPage(5, { totalItems: 60, totalPages: 2 })).toBe(2);
    expect(state.page()).toBe(2);
    expect(state.applyPage(1, { totalItems: 0, totalPages: 0 })).toBeNull();
  });
});

describe("PaginatedList", () => {
  it("loads pages, resets size changes to page one, and reloads the last page when past the end", () => {
    const fetch = jest.fn((request: PageRequest) =>
      of(response([request.page], 2 * SIZE + 20, request.pageSize)),
    );
    const { list } = createList(fetch);
    list.load();
    expect(list.items()).toEqual([1]);
    expect(list.pageCount()).toBe(3);
    list.changePage(3);
    expect(fetch).toHaveBeenLastCalledWith({ page: 3, pageSize: SIZE });
    list.changePageSize(20);
    expect(fetch).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 });

    fetch.mockImplementationOnce(() => of(response([], 10, 20)));
    list.load(3);
    expect(fetch).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 });
    expect(list.page()).toBe(1);
  });

  it("drops stale responses and cancels on destroy", () => {
    const first = new Subject<PageResponse<string>>();
    const second = new Subject<PageResponse<string>>();
    const fetch = jest
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const { list, destroy } = createList<string>(fetch);
    list.load();
    list.reset();
    first.next(response(["stale"], 1));
    expect(list.items()).toEqual([]);
    second.next(response(["fresh"], 1));
    expect(list.items()).toEqual(["fresh"]);
    expect(list.loading()).toBe(false);

    const pending = new Subject<PageResponse<string>>();
    fetch.mockReturnValueOnce(pending);
    list.load();
    destroy();
    expect(pending.observed).toBe(false);
  });

  it("appends pages in load-more mode and reports errors", () => {
    const fetch = jest.fn((request: PageRequest) =>
      of(response([`item-${request.page}`], 2 * SIZE + 1)),
    );
    const onError = jest.fn();
    const destroyRef = { onDestroy: jest.fn() } as unknown as DestroyRef;
    const list = new PaginatedList<string>({ fetch, onError }, destroyRef);
    list.load();
    list.loadMore();
    expect(list.items()).toEqual(["item-1", "item-2"]);
    expect(list.hasMore()).toBe(true);
    const failed = new Subject<PageResponse<string>>();
    fetch.mockReturnValueOnce(failed);
    list.loadMore();
    failed.error(new Error("offline"));
    expect(list.error()).toBe(true);
    expect(list.hasMore()).toBe(false);
    expect(onError).toHaveBeenCalled();
    expect(list.items()).toEqual(["item-1", "item-2"]);
  });

  it("navigates instead of loading for URL-driven lists", () => {
    const navigate = jest.fn();
    const { list } = createList(() => of(response(["a"], 10)), {
      navigate,
    });
    list.load(4);
    expect(navigate).toHaveBeenCalledWith({ page: 1, pageSize: SIZE });
    list.applyPage(1, { totalItems: 200, totalPages: 4 });
    list.changePageSize(20);
    expect(navigate).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 });
  });
});

describe("LocalPagination", () => {
  it("slices the source and clamps when it shrinks", () => {
    const source = signal(
      Array.from({ length: 2 * SIZE + 20 }, (_, index) => index),
    );
    const pages = new LocalPagination(source);
    expect(pages.items()).toHaveLength(SIZE);
    pages.changePage(3);
    expect(pages.items()).toEqual(source().slice(2 * SIZE));
    source.set(source().slice(0, 30));
    pages.clamp();
    expect(pages.page()).toBe(1);
    expect(pages.totalItems()).toBe(30);
  });
});
