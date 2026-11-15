// Keep the real hook and persistence registry in a single test module graph so
// account switches exercise the exact scope that the hook reads.
export {
  useStudyWidget,
  clearNativeStudyWidget,
} from "../../src/useStudyWidget";
export {
  empty,
  save,
  load,
  setStorageName,
  setStorageAccount,
} from "../../src/data";
