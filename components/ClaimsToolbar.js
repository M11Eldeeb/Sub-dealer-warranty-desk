"use client";
import { useState, useRef, useEffect } from "react";
import { STATUS } from "@/components/ui";
import { SlidersHorizontal, ArrowUpDown, X, Check } from "lucide-react";

export const DEFAULT_FILTER_STATE = {
  statuses: [],
  branchIds: [],
  createdFrom: "",
  createdTo: "",
  receptionFrom: "",
  receptionTo: "",
  sortField: "created_at",
  sortDir: "desc",
};

export function applyClaimsFilterSort(claims, state) {
  let result = claims.filter((c) => {
    if (state.statuses.length && !state.statuses.includes(c.status)) return false;
    if (state.branchIds.length && !state.branchIds.includes(c.branch_id)) return false;
    if (state.createdFrom && new Date(c.created_at) < new Date(state.createdFrom)) return false;
    if (state.createdTo && new Date(c.created_at) > new Date(state.createdTo + "T23:59:59")) return false;
    if (state.receptionFrom && c.reception_date && c.reception_date < state.receptionFrom) return false;
    if (state.receptionTo && c.reception_date && c.reception_date > state.receptionTo) return false;
    return true;
  });

  const dir = state.sortDir === "asc" ? 1 : -1;
  return [...result].sort((a, b) => {
    switch (state.sortField) {
      case "reception_date":
        return dir * (a.reception_date || "").localeCompare(b.reception_date || "");
      case "status":
        return dir * (a.status || "").localeCompare(b.status || "");
      case "claim_number":
        return dir * (a.claim_number || "").localeCompare(b.claim_number || "");
      case "branch":
        return dir * (a.branches?.name || "").localeCompare(b.branches?.name || "");
      case "created_at":
      default:
        return dir * (new Date(a.created_at) - new Date(b.created_at));
    }
  });
}

export function applyPartsFilterSort(parts, state) {
  let result = parts.filter((p) => {
    const c = p.claims;
    if (state.branchIds.length && !state.branchIds.includes(c?.branch_id)) return false;
    if (state.createdFrom && new Date(p.created_at) < new Date(state.createdFrom)) return false;
    if (state.createdTo && new Date(p.created_at) > new Date(state.createdTo + "T23:59:59")) return false;
    if (state.receptionFrom && c?.reception_date && c.reception_date < state.receptionFrom) return false;
    if (state.receptionTo && c?.reception_date && c.reception_date > state.receptionTo) return false;
    return true;
  });

  const dir = state.sortDir === "asc" ? 1 : -1;
  return [...result].sort((a, b) => {
    switch (state.sortField) {
      case "reception_date":
        return dir * (a.claims?.reception_date || "").localeCompare(b.claims?.reception_date || "");
      case "claim_number":
        return dir * (a.claims?.claim_number || "").localeCompare(b.claims?.claim_number || "");
      case "branch":
        return dir * (a.claims?.branches?.name || "").localeCompare(b.claims?.branches?.name || "");
      case "created_at":
      default:
        return dir * (new Date(a.created_at) - new Date(b.created_at));
    }
  });
}

function usePopover() {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);
  return [ref, open, setOpen];
}

export default function ClaimsToolbar({
  state,
  onChange,
  statusOptions, // array of status keys to offer, or null to hide the status filter entirely
  branches, // array of {id, name} to offer, or null to hide the branch filter entirely
  sortOptions, // array of { value, label }
  showReceptionDate = true,
}) {
  const [filterRef, filterOpen, setFilterOpen] = usePopover();
  const [sortRef, sortOpen, setSortOpen] = usePopover();

  const set = (patch) => onChange({ ...state, ...patch });

  const toggleInArray = (key, val) => {
    const arr = state[key];
    set({ [key]: arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val] });
  };

  const activeFilterCount =
    state.statuses.length +
    state.branchIds.length +
    (state.createdFrom ? 1 : 0) +
    (state.createdTo ? 1 : 0) +
    (state.receptionFrom ? 1 : 0) +
    (state.receptionTo ? 1 : 0);

  const clearFilters = () =>
    set({ statuses: [], branchIds: [], createdFrom: "", createdTo: "", receptionFrom: "", receptionTo: "" });

  const currentSortLabel = sortOptions.find((o) => o.value === state.sortField)?.label || "Sort";

  return (
    <div className="flex items-center gap-2">
      {(statusOptions || branches) && (
        <div className="relative" ref={filterRef}>
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs uppercase tracking-wide border transition-colors ${
              activeFilterCount > 0 ? "bg-[#111111] text-white border-[#111111]" : "bg-white text-[#4D4D4D] border-[#E0E0E0] hover:border-[#111111]"
            }`}
          >
            <SlidersHorizontal size={13} />
            Filter
            {activeFilterCount > 0 && (
              <span className="bg-[#E4002B] text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                {activeFilterCount}
              </span>
            )}
          </button>

          {filterOpen && (
            <div className="absolute z-30 top-full mt-2 right-0 w-72 bg-white border border-[#E0E0E0] rounded-lg shadow-xl p-4 space-y-4">
              {branches && branches.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[#6E6E6E] mb-2">Branch</div>
                  <div className="max-h-28 overflow-y-auto space-y-1.5">
                    {branches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={state.branchIds.includes(b.id)}
                          onChange={() => toggleInArray("branchIds", b.id)}
                          className="accent-[#E4002B]"
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {statusOptions && statusOptions.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[#6E6E6E] mb-2">Status</div>
                  <div className="max-h-32 overflow-y-auto space-y-1.5">
                    {statusOptions.map((s) => (
                      <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={state.statuses.includes(s)}
                          onChange={() => toggleInArray("statuses", s)}
                          className="accent-[#E4002B]"
                        />
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: STATUS[s]?.color }} />
                          {STATUS[s]?.label || s}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-[#6E6E6E] mb-2">Creation Date</div>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={state.createdFrom}
                    onChange={(e) => set({ createdFrom: e.target.value })}
                    className="input text-xs flex-1"
                  />
                  <input
                    type="date"
                    value={state.createdTo}
                    onChange={(e) => set({ createdTo: e.target.value })}
                    className="input text-xs flex-1"
                  />
                </div>
              </div>

              {showReceptionDate && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[#6E6E6E] mb-2">Reception Date</div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={state.receptionFrom}
                      onChange={(e) => set({ receptionFrom: e.target.value })}
                      className="input text-xs flex-1"
                    />
                    <input
                      type="date"
                      value={state.receptionTo}
                      onChange={(e) => set({ receptionTo: e.target.value })}
                      className="input text-xs flex-1"
                    />
                  </div>
                </div>
              )}

              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs font-bold text-[#B23A32] hover:underline"
                >
                  <X size={12} /> Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="relative" ref={sortRef}>
        <button
          onClick={() => setSortOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs uppercase tracking-wide border border-[#E0E0E0] bg-white text-[#4D4D4D] hover:border-[#111111] transition-colors"
        >
          <ArrowUpDown size={13} />
          {currentSortLabel}
        </button>

        {sortOpen && (
          <div className="absolute z-30 top-full mt-2 right-0 w-56 bg-white border border-[#E0E0E0] rounded-lg shadow-xl p-2">
            {sortOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => set({ sortField: o.value })}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded text-sm text-left hover:bg-[#F4F4F4]"
              >
                {o.label}
                {state.sortField === o.value && <Check size={14} className="text-[#E4002B]" />}
              </button>
            ))}
            <div className="border-t border-[#E0E0E0] mt-1 pt-1 flex gap-1">
              <button
                onClick={() => set({ sortDir: "asc" })}
                className={`flex-1 px-2.5 py-1.5 rounded text-xs font-bold uppercase tracking-wide ${
                  state.sortDir === "asc" ? "bg-[#111111] text-white" : "text-[#6E6E6E] hover:bg-[#F4F4F4]"
                }`}
              >
                Ascending
              </button>
              <button
                onClick={() => set({ sortDir: "desc" })}
                className={`flex-1 px-2.5 py-1.5 rounded text-xs font-bold uppercase tracking-wide ${
                  state.sortDir === "desc" ? "bg-[#111111] text-white" : "text-[#6E6E6E] hover:bg-[#F4F4F4]"
                }`}
              >
                Descending
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
