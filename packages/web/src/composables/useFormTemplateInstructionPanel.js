import { computed, ref } from 'vue';
import { getDocumentByReport, getDocumentIndicator, lookupTestifyRules } from '../api';
import { resolveIndicatorKeyAtCell } from '../utils/formTemplateIndicator.js';

export function useFormTemplateInstructionPanel() {
  const selectedCell = ref(null);
  const instruction = ref(null);
  const instructionError = ref('');
  const loadingInstruction = ref(false);
  const testifyRules = ref([]);

  const instructionBodies = computed(() =>
    (instruction.value?.indicator?.children || [])
      .filter((c) => c.nodeKind === 'body')
      .map((c) => c.text)
  );

  const instructionOpen = computed(
    () =>
      Boolean(selectedCell.value) ||
      Boolean(instruction.value) ||
      Boolean(instructionError.value) ||
      loadingInstruction.value
  );

  function clearInstruction() {
    selectedCell.value = null;
    instruction.value = null;
    instructionError.value = '';
    testifyRules.value = [];
  }

  async function onIndicatorCellClick({ matrix, reportCode, versionLabel, row, col }) {
    selectedCell.value = { row, col };
    instruction.value = null;
    instructionError.value = '';
    testifyRules.value = [];

    const key = resolveIndicatorKeyAtCell(matrix, row, col);
    if (!key) {
      instructionError.value = '无法识别指标序号';
      return;
    }

    if (!reportCode) {
      instructionError.value = '当前表样缺少表号';
      return;
    }

    loadingInstruction.value = true;
    try {
      let docMeta;
      try {
        docMeta = await getDocumentByReport(reportCode, { versionLabel });
      } catch {
        instructionError.value = `未找到表样 ${reportCode} 对应的填报说明，请先导入并关联`;
        return;
      }

      const [instructionResult, rulesResult] = await Promise.allSettled([
        getDocumentIndicator(docMeta.id, key),
        lookupTestifyRules({
          docCode: docMeta.docCode,
          indicatorKey: key,
          versionLabel,
        }),
      ]);

      if (instructionResult.status === 'fulfilled') {
        instruction.value = instructionResult.value;
      } else {
        instructionError.value =
          instructionResult.reason?.message || `未找到指标 ${key} 的填报说明`;
      }

      if (rulesResult.status === 'fulfilled') {
        testifyRules.value = rulesResult.value?.items || [];
      }
    } finally {
      loadingInstruction.value = false;
    }
  }

  return {
    selectedCell,
    instruction,
    instructionError,
    loadingInstruction,
    testifyRules,
    instructionBodies,
    instructionOpen,
    clearInstruction,
    onIndicatorCellClick,
  };
}
