import {
  GOT_BUTTERCHURN_PRESETS,
  GOT_BUTTERCHURN,
  SELECT_PRESET_AT_INDEX,
  RESOLVE_PRESET_AT_INDEX,
  TOGGLE_PRESET_OVERLAY,
  PRESET_REQUESTED
} from "../actionTypes";
import * as Selectors from "../selectors";
import {
  Dispatchable,
  TransitionType,
  Preset,
  ButterchurnOptions,
  StatePreset
} from "../types";
import * as FileUtils from "../fileUtils";

function normalizePresetTypes(preset: Preset): StatePreset {
  const { name } = preset;
  if (preset.butterchurnPresetObject != null) {
    return {
      type: "RESOLVED",
      name,
      preset: preset.butterchurnPresetObject
    };
  } else if (preset.getButterchrunPresetObject) {
    return {
      type: "UNRESOLVED",
      name,
      getPreset: preset.getButterchrunPresetObject
    };
  } else if (preset.butterchurnPresetUrl != null) {
    return {
      type: "UNRESOLVED",
      name,
      getPreset: async () => {
        const resp = await fetch(preset.butterchurnPresetUrl);
        return resp.json();
      }
    };
  }
  throw new Error("Invalid preset object");
}

export function initializePresets(
  presetOptions: ButterchurnOptions
): Dispatchable {
  return async dispatch => {
    const { getPresets, importButterchurn } = presetOptions;
    importButterchurn().then(butterchurn => {
      dispatch({ type: GOT_BUTTERCHURN, butterchurn: butterchurn.default });
    });

    const presets = await getPresets();
    const normalizePresets = presets.map(normalizePresetTypes);
    dispatch(loadPresets(normalizePresets));
  };
}

export function loadPresets(presets: StatePreset[]): Dispatchable {
  return (dispatch, getState) => {
    const presetLength = getState().milkdrop.presets.length;
    dispatch({ type: GOT_BUTTERCHURN_PRESETS, presets });
    dispatch(
      requestPresetAtIndex(presetLength, TransitionType.IMMEDIATE, true)
    );
  };
}

export function appendPresetFileList(fileList: FileList): Dispatchable {
  return async (dispatch, getState, { convertPreset }) => {
    const presets: StatePreset[] = Array.from(fileList)
      .map(file => {
        const JSON_EXT = ".json";
        const MILK_EXT = ".milk";
        const filename = file.name.toLowerCase();
        if (filename.endsWith(MILK_EXT)) {
          if (convertPreset == null) {
            throw new Error("Invalid type");
          }
          return {
            type: "UNRESOLVED",
            name: file.name.slice(0, file.name.length - MILK_EXT.length),
            getPreset: () => convertPreset(file)
          } as StatePreset;
        } else if (filename.endsWith(JSON_EXT)) {
          return {
            type: "UNRESOLVED",
            name: file.name.slice(0, file.name.length - JSON_EXT.length),
            getPreset: async () => {
              const str = await FileUtils.genStringFromFileReference(file);
              // TODO: How should we handle the case where json parsing fails?
              return JSON.parse(str);
            }
          } as StatePreset;
        } else {
          throw new Error("Invalid type");
        }
        return null as never;
      })
      .filter(Boolean);
    dispatch(loadPresets(presets));
    // TODO: Select the first of these presets
  };
}

export function selectNextPreset(
  transitionType: TransitionType = TransitionType.DEFAULT
): Dispatchable {
  return (dispatch, getState) => {
    const currentPresetIndex = Selectors.getCurrentPresetIndex(getState());
    if (currentPresetIndex == null) {
      return;
    }
    const nextPresetIndex = currentPresetIndex + 1;
    dispatch(requestPresetAtIndex(nextPresetIndex, transitionType, true));
  };
}

export function selectPreviousPreset(
  transitionType: TransitionType = TransitionType.DEFAULT
): Dispatchable {
  return (dispatch, getState) => {
    const state = getState();
    const { presetHistory } = state.milkdrop;
    if (presetHistory.length < 1) {
      return;
    }
    // Awkward. We do -2 becuase the the last track is the current track.
    const lastPresetIndex = presetHistory[presetHistory.length - 2];

    dispatch(requestPresetAtIndex(lastPresetIndex, transitionType, false));
  };
}

export function selectRandomPreset(
  transitionType: TransitionType = TransitionType.DEFAULT
): Dispatchable {
  return (dispatch, getState) => {
    const state = getState();
    // TODO: Make this a selector.
    const randomIndex = Math.floor(
      Math.random() * state.milkdrop.presets.length
    );
    dispatch(requestPresetAtIndex(randomIndex, transitionType, true));
  };
}

// TODO: Technically there's a race here. If you request two presets in a row, the
// first one may resolve before the second.
export function requestPresetAtIndex(
  index: number,
  transitionType: TransitionType,
  addToHistory: boolean
): Dispatchable {
  return async (dispatch, getState) => {
    const state = getState();
    const preset = state.milkdrop.presets[index];
    if (preset == null) {
      // Index might be out of range.
      return;
    }
    dispatch({ type: PRESET_REQUESTED, index, addToHistory });
    switch (preset.type) {
      case "RESOLVED":
        dispatch({ type: SELECT_PRESET_AT_INDEX, index, transitionType });
        return;
      case "UNRESOLVED":
        const json = await preset.getPreset();
        // TODO: Ensure that this works correctly even if requests resolve out of order
        dispatch({ type: RESOLVE_PRESET_AT_INDEX, index, json });
        dispatch({ type: SELECT_PRESET_AT_INDEX, index, transitionType });
        return;
    }
  };
}

export function handlePresetDrop(e: React.DragEvent): Dispatchable {
  return appendPresetFileList(e.dataTransfer.files);
}

export function togglePresetOverlay(): Dispatchable {
  return { type: TOGGLE_PRESET_OVERLAY };
}
