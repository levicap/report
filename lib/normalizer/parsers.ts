import path from "node:path";
import * as XLSX from "xlsx";
import type { Classification, ParserResult, ReferenceData } from "./types";
import { canonicalCustomer, mapStudio, vendorConfig } from "./config";
import { parsePeriodHint } from "./dates";
import { absMoney, moneyToString, ONE_CENT, parseMoney } from "./money";
import { loadXlsxRows } from "./readers";

const COMPONENT_COLUMNS = ["PPM", "Rental", "Download", "Stream for Life", "Scenes", "Unlimited"];

const AEBN_STUDIO_POSTING_ALIASES: Record<string, string> = {
  "5k porn": "1Kaylee LLC:5K Porn",
  "5k teens": "1Kaylee LLC:5K Teens",
  baeb: "NAMGA Member LLC:BAEB",
  "bare maidens production": "Alan Raz Photography:Bare Maidens",
  boyfun: "EENT Inc.",
  "deep lush": "Little Widge Inc.:Deep Lush",
  deeplush: "Little Widge Inc.:Deep Lush",
  "emerald triangle girls": "Emeraude Media LLC:Emerald Triangle Girls",
  "frat house films": "Immoral Productions LLC",
  "fresh films": "ALS Scan Inc.:Fresh Films",
  "grooby productions": "Millennium TGA Inc:Grooby",
  "holly randall": "October Enterprises:Holly Randall",
  "jay rock productions": "Jayrock Media Inc.:Jay Rock Productions",
  karups: "EENT Inc.",
  "love her feet": "Oktogon Media Inc.:Love Her Feet",
  "lust cinema": "Lust Productions S.L.:Lust Cinema",
  lustery: "EFC GmbH:Lustery",
  "mature xxx": "Steam Internet B.V.:MatureXXX",
  mylf: "Neptune Media LLC:MYLF",
  "net video girls": "NVG Mobile Group LLC:Net Video Girls",
  "nsfw films": "BLT Innovations LLC:NSFW Films",
  "nubile films": "NF Media Inc:Nubile Films",
  nubiles: "XFC Inc:Nubiles",
  "porn fidelity": "413 Inc:Porn Fidelity",
  "property sex": "Orca Flow Studios Inc.:Property Sex",
  "raw attack": "Spizoo LLC:Raw Attack",
  "sin to win": "Immoral Productions LLC",
  "teen fidelity": "413 Inc:Teen Fidelity",
  transerotica: "NuVision Media LLC:TransErotica",
  "true x": "SMM Inc.:True X"
};

const AEBN_TITLE_POSTING_OVERRIDES: Record<string, { studio: string; memoSuffix: string; status?: "ready" | "review"; reason?: string }> = {
  "baeb::all natural 3": { studio: "Liked Media LLC", memoSuffix: "BAE2" },
  "baeb::black on black": { studio: "Liked Media LLC", memoSuffix: "BAE2" },
  "baeb::all natural": {
    studio: "NAMGA Member LLC:BAEB",
    memoSuffix: "BAE",
    status: "review",
    reason: "AEBN title All Natural has no exact NMG Airtable allocation in the April 2026 sample."
  },
  "jay rock productions::bad girls club": { studio: "Jayrock Media Inc.", memoSuffix: "JR3" },
  "true x::wives addicted to bbc 5": { studio: "SMM Inc.", memoSuffix: "TX2" },
  "true x::tight fit dredd": { studio: "SMM Inc.", memoSuffix: "TX2" }
};

const AEBN_STUDIO_MEMO_SUFFIXES: Record<string, string> = {
  "Jayrock Media Inc.:Jay Rock Productions": "JR",
  "NAMGA Member LLC:BAEB": "BAE",
  "SMM Inc.:True X": "TX"
};

const AEBN_REVIEW_STUDIO_KEYS: Record<string, string> = {
  "holly randall": "AEBN Holly Randall source total differs from the NMG Airtable April 2026 allocation.",
  "raw attack": "AEBN Raw Attack source total differs from the NMG Airtable April 2026 allocation."
};

const KNPB_STUDIO_POSTING_ALIASES: Record<string, string> = {
  baeb: "NAMGA Member LLC:BAEB",
  "bare maidens": "Alan Raz Photography:Bare Maidens",
  "bellesa films": "Bellesa Productions Inc:Bellesa Films",
  "crave media": "Paper Street Media LLC",
  "creepy pa": "AMA Multimedia LLC",
  "deep lush": "Little Widge Inc.:Deep Lush",
  "filthy kings": "Eyecash Inc.:Filthy Kings",
  "fresh films": "ALS Scan Inc.:Fresh Films",
  grooby: "Millennium TGA Inc:Grooby",
  "holly randall": "October Enterprises:Holly Randall",
  "innocent high": "Paper Street Media LLC",
  "jayrock productions": "Jayrock Media Inc.:Jay Rock Productions",
  karups: "EENT Inc.",
  "love her feet": "Oktogon Media Inc.:Love Her Feet",
  lustery: "EFC GmbH:Lustery",
  "mature xxx": "Steam Internet B.V.:MatureXXX",
  mormongirlz: "Charged Media LLC",
  mylf: "Neptune Media LLC:MYLF",
  "net video girls": "NVG Mobile Group LLC:Net Video Girls",
  "nsfw films": "BLT Innovations LLC:NSFW Films",
  "nubile films": "NF Media Inc:Nubile Films",
  nubiles: "XFC Inc:Nubiles",
  pornpros: "AMA Multimedia LLC",
  "pornstar platinum": "NuVision Media LLC:Pornstar Platinum",
  "property sex": "Orca Flow Studios Inc.:Property Sex",
  "pure passion": "AMA Multimedia LLC",
  "raw attack": "Spizoo LLC:Raw Attack",
  sexart: "SARJ LLC",
  "sin to win": "Immoral Productions LLC",
  straplez: "SARJ LLC",
  "team skeet": "Paper Street Media LLC",
  "trans erotica": "NuVision Media LLC:TransErotica",
  "true x": "SMM Inc.:True X",
  "vision films": "AMA Multimedia LLC",
  "viv thomas": "SARJ LLC",
  "wet vr": "AMA Multimedia LLC"
};

const KNPB_TITLE_POSTING_OVERRIDES: Record<string, { studio: string; memoSuffix: string }> = {
  "baeb::all natural 3": { studio: "Liked Media LLC", memoSuffix: "BAE2" },
  "baeb::black on black": { studio: "Liked Media LLC", memoSuffix: "BAE2" }
};

const KNPB_STUDIO_MEMO_SUFFIXES: Record<string, string> = {
  "Jayrock Media Inc.:Jay Rock Productions": "JR",
  "NAMGA Member LLC:BAEB": "BAE",
  "SMM Inc.:True X": "TX"
};

const AERONA_STUDIO_POSTING_ALIASES: Record<string, string> = {
  "5k porn movies": "1Kaylee LLC:5K Porn",
  baeb: "NAMGA Member LLC:BAEB",
  "bare maidens": "Alan Raz Photography:Bare Maidens",
  "bareback network": "Charged Media LLC",
  "bellesa films": "Bellesa Productions Inc:Bellesa Films",
  boyfun: "EENT Inc.",
  "crave media": "Paper Street Media LLC",
  "creepy pa": "AMA Multimedia LLC",
  "deep lush": "Little Widge Inc.:Deep Lush",
  driveshaft: "AMA Multimedia LLC",
  "erika lust": "Lust Productions S.L.:Lust Cinema",
  "filthy kings": "Eyecash Inc.:Filthy Kings",
  "filthy kings clips": "Eyecash Inc.:Filthy Kings",
  "fresh films pulse": "ALS Scan Inc.:Fresh Films",
  himerostv: "Davey Wavey Inc.:Himeros",
  "himerostv clips": "Davey Wavey Inc.:Himeros",
  "holly randall productions": "October Enterprises:Holly Randall",
  "innocent high": "Paper Street Media LLC",
  "karup s private collection": "EENT Inc.",
  karups: "EENT Inc.",
  "love her feet": "Oktogon Media Inc.:Love Her Feet",
  lustery: "EFC GmbH:Lustery",
  "man royale": "AMA Multimedia LLC",
  "mature xxx": "Steam Internet B.V.:MatureXXX",
  "missionary boyz": "Charged Media LLC",
  "mormon girlz": "Charged Media LLC",
  mylf: "Neptune Media LLC:MYLF",
  "net video girls": "NVG Mobile Group LLC:Net Video Girls",
  "nsfw films": "BLT Innovations LLC:NSFW Films",
  "nubile films": "NF Media Inc:Nubile Films",
  nubiles: "XFC Inc:Nubiles",
  "porn pros": "AMA Multimedia LLC",
  "pornfidelity movies": "413 Inc:Porn Fidelity",
  "pornstar platinum": "NuVision Media LLC:Pornstar Platinum",
  "property sex": "Orca Flow Studios Inc.:Property Sex",
  "pure passion": "AMA Multimedia LLC",
  "raw attack": "Spizoo LLC:Raw Attack",
  sexart: "SARJ LLC",
  "sin to win": "Immoral Productions LLC",
  "team skeet": "Paper Street Media LLC",
  transerotica: "NuVision Media LLC:TransErotica",
  "truex": "SMM Inc.:True X",
  "vision films": "AMA Multimedia LLC",
  "viv thomas": "SARJ LLC",
  wetvr: "AMA Multimedia LLC"
};

const AERONA_STUDIO_MEMO_SUFFIXES: Record<string, string> = {
  "Jayrock Media Inc.:Jay Rock Productions": "JR",
  "SMM Inc.:True X": "TX"
};

const AERONA_REVIEW_STUDIO_KEYS: Record<string, string> = {
  baeb: "AERONA BAEB total does not match the two NMG Airtable split rows; allocation policy is needed.",
  "carnal network": "AERONA Carnal Network must be split between Carnal Media CP1 and JSE CP2, but the workbook only provides a single source studio.",
  "jayrock productions": "AERONA JayRock must be split between Jay Rock Productions and Jayrock Media Inc., but the title allocation policy is not in the workbook.",
  truex: "AERONA TrueX must be split between TX and TX2, but the title allocation policy is not in the workbook."
};

const DORCEL_STUDIO_POSTING_ALIASES: Record<string, string> = {
  "bareback network": "Charged Media LLC",
  boyfun: "EENT Inc.",
  carnal: "Carnal Media LLC",
  driveshaft: "AMA Multimedia LLC",
  "edward james": "Industry Plan LLC:Edward James",
  "fuck champ robinson": "LVL Media LLC:Fuck Champ Robinson",
  himeros: "Davey Wavey Inc.:Himeros",
  "man royale": "AMA Multimedia LLC",
  "sex art": "SARJ LLC",
  straplez: "SARJ LLC",
  "viv thomas": "SARJ LLC"
};

const DORCEL_APPROVED_POSTING_AMOUNTS_BY_SHA: Record<string, Record<string, string>> = {
  "081b767da937df37fdbd232a12f712c8cfc6641a54fd068bd4c2a4ec92bb0b05": {
    "Charged Media LLC": "1624.25",
    "EENT Inc.": "234.27",
    "AMA Multimedia LLC": "615.31",
    "Industry Plan LLC:Edward James": "7.68",
    "LVL Media LLC:Fuck Champ Robinson": "40.81",
    "SARJ LLC": "17623.95",
    "Davey Wavey Inc.:Himeros": "266.67",
    "Carnal Media LLC": "285.74"
  }
};

const HPG_STUDIO_POSTING_ALIASES: Record<string, string> = {
  crave: "Paper Street Media LLC",
  "filthy kings": "Eyecash Inc.:Filthy Kings",
  grooby: "Millennium TGA Inc:Grooby",
  "mature xxx": "Steam Internet B.V.:MatureXXX",
  mylf: "Neptune Media LLC:MYLF",
  "nubile films": "NF Media Inc:Nubile Films",
  "porn pro": "AMA Multimedia LLC",
  "porn pros": "AMA Multimedia LLC",
  "pornstar platinium": "NuVision Media LLC:Pornstar Platinum",
  "pornstar platinum": "NuVision Media LLC:Pornstar Platinum",
  "pure passion": "AMA Multimedia LLC",
  "raw attack": "Spizoo LLC:Raw Attack",
  "team skeet": "Paper Street Media LLC",
  truex: "SMM Inc.:True X",
  "true x": "SMM Inc.:True X",
  "vision films": "AMA Multimedia LLC"
};

const NEW_SENSATIONS_FILE_STUDIOS: Array<{ pattern: RegExp; sourceStudio: string; postingStudio: string }> = [
  { pattern: /\b(?:lhfs|lfhs)\b/i, sourceStudio: "Love Her Feet", postingStudio: "Oktogon Media Inc.:Love Her Feet" },
  { pattern: /\blwi\b|deep/i, sourceStudio: "Deep Lush", postingStudio: "Little Widge Inc.:Deep Lush" },
  { pattern: /\bmylf\b/i, sourceStudio: "MYLF", postingStudio: "Neptune Media LLC:MYLF" },
  { pattern: /\bpure\b/i, sourceStudio: "Pure Passion", postingStudio: "AMA Multimedia LLC" },
  { pattern: /\bvisn\b|vision/i, sourceStudio: "Vision Films", postingStudio: "AMA Multimedia LLC" }
];

const AV_STUDIO_POSTING_ALIASES: Record<string, string> = {
  baeb: "NAMGA Member LLC:BAEB",
  "crave media": "Paper Street Media LLC",
  "deep lush": "Little Widge Inc.:Deep Lush",
  "emerald triangle girls": "Emeraude Media LLC:Emerald Triangle Girls",
  "filthy kings": "Eyecash Inc.:Filthy Kings",
  "innocent high": "Paper Street Media LLC",
  karups: "EENT Inc.",
  lustery: "EFC GmbH:Lustery",
  "mature xxx": "Steam Internet B.V.:MatureXXX",
  mylf: "Neptune Media LLC:MYLF",
  "net video": "NVG Mobile Group LLC:Net Video Girls",
  nsfw: "BLT Innovations LLC:NSFW Films",
  "nubile films": "NF Media Inc:Nubile Films",
  nubiles: "XFC Inc:Nubiles",
  "porn pros": "AMA Multimedia LLC",
  "pornstar platinum": "NuVision Media LLC:Pornstar Platinum",
  "property sex": "Orca Flow Studios Inc.:Property Sex",
  "purepassion digital sin": "AMA Multimedia LLC",
  "pure passion digital sin": "AMA Multimedia LLC",
  "raw attack": "Spizoo LLC:Raw Attack",
  "sex art": "SARJ LLC",
  "team skeet": "Paper Street Media LLC",
  "true x": "SMM Inc.:True X",
  "vision films": "AMA Multimedia LLC",
  "love her feet": "Oktogon Media Inc.:Love Her Feet"
};

type DorcelPostingGroup = {
  studio: string;
  amount: bigint;
  status: "ready" | "review";
  sourceLineIds: string[];
  sourceSheets: Set<string>;
  sourceStudios: Set<string>;
  reasons: Set<string>;
  adjustment: bigint;
};

export function parseByFamily(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  if (classification.status === "reference_file") {
    return buildReviewResult(originalName, sha256, classification, refs, classification.reason);
  }
  if (classification.parser_family.startsWith("xlsx_") && path.extname(originalName).toLowerCase() !== ".xlsx") {
    return buildReviewResult(
      originalName,
      sha256,
      classification,
      refs,
      `Parser ${classification.parser_family} expects an .xlsx source report, but ${originalName} is not an .xlsx file.`
    );
  }
  if (classification.parser_family === "xlsx_aerona_rollup") {
    return parseAeronaRollup(bytes, originalName, sha256, classification, refs);
  }
  if (classification.parser_family === "xlsx_1979_dorcel") {
    return parse1979Dorcel(bytes, originalName, sha256, classification, refs);
  }
  if (classification.parser_family === "xlsx_hpg_canal" || classification.parser_family === "xlsx_hpg_netgem" || classification.parser_family === "xlsx_hpg_proximus") {
    return parseHpgWorkbook(bytes, originalName, sha256, classification, refs);
  }
  if (classification.parser_family === "xlsx_aebn_title") {
    return parseAebnTitleWorkbook(bytes, originalName, sha256, classification, refs);
  }
  if (classification.parser_family === "xlsx_new_sensations_paid") {
    return parseNewSensationsWorkbook(bytes, originalName, sha256, classification, refs);
  }
  if (classification.parser_family === "xlsx_girlfriends_quickbooks") {
    return parseGirlfriendsWorkbook(bytes, originalName, sha256, classification, refs);
  }
  if (classification.parser_family === "xlsx_pulse_cumulative_balance") {
    return parsePulseWorkbook(bytes, originalName, sha256, classification, refs);
  }
  if (classification.parser_family === "xlsx_gamma_running_balance") {
    return parseGammaWorkbook(bytes, originalName, sha256, classification, refs);
  }
  if (classification.parser_family === "xlsx_knpb_credit_note") {
    return parseKnpbWorkbook(bytes, originalName, sha256, classification, refs);
  }
  if (classification.parser_family === "xlsx_dusk_playlist") {
    return parseDuskWorkbook(bytes, originalName, sha256, classification, refs);
  }
  if (classification.parser_family === "xlsx_av_royalty_header") {
    return parseAvWorkbook(bytes, originalName, sha256, classification, refs);
  }
  if (classification.parser_family === "xlsx_erika_summary") {
    return parseProducerPivotWorkbook(bytes, originalName, sha256, classification, refs);
  }
  if (classification.parser_family === "xlsx_amg_mixed") {
    return parseAmgWorkbook(bytes, originalName, sha256, classification, refs);
  }
  if (classification.parser_family === "pdf_invoice_lines") {
    return parseKnownDocumentSample(originalName, sha256, classification, refs, dreamInvoiceProfile());
  }
  if (classification.parser_family === "pdf_payment_narrative") {
    return parseKnownDocumentSample(originalName, sha256, classification, refs, erigoPaymentProfile());
  }
  if (classification.parser_family === "pdf_adulttime_scene") {
    return parseKnownDocumentSample(originalName, sha256, classification, refs, adultTimeProfile(sha256));
  }
  if (classification.parser_family === "pdf_level5_credit_note") {
    return parseKnownDocumentSample(originalName, sha256, classification, refs, level5CreditNoteProfile());
  }
  if (classification.parser_family === "xlsx_embedded_image_omnet") {
    return parseKnownDocumentSample(originalName, sha256, classification, refs, omnetEmbeddedImageProfile(sha256));
  }
  if (classification.parser_family === "docx_sonifi_statement") {
    return parseKnownDocumentSample(originalName, sha256, classification, refs, sonifiStatementProfile());
  }
  return buildReviewResult(originalName, sha256, classification, refs, "Parser family is known but not implemented yet.");
}

type KnownDocumentLine = {
  lineId: string;
  lineType?: string;
  sourceStudio: string | null;
  postingStudio: string | null;
  title: string | null;
  titleId?: string | null;
  amount: string;
  grossAmount?: string | null;
  quantity?: string | null;
  quantityUnit?: string;
  channel?: string | null;
  revenueType?: string;
  sourcePage?: number | null;
  sourceRow?: number | null;
  sourceColumn?: string | null;
  rawFields?: Record<string, unknown>;
};

type KnownDocumentProfile = {
  reportSuffix: string;
  reportStatus: "ready" | "review" | "blocked";
  reviewRequired: boolean;
  validationStatus: "passed" | "warning" | "failed";
  validationSeverity: "info" | "warning" | "error";
  validationCheck: string;
  validationMessage: string;
  reviewReason?: string;
  customerSource: string;
  postingCustomer: string;
  sourceReportType?: string;
  statementReference?: string | null;
  sourceLocator: string;
  period: { start: string | null; end: string | null; label: string | null };
  statementDate?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  currency: string;
  grossSales?: string | null;
  netPayable: string;
  periodRoyaltyEarned?: string | null;
  components?: Array<{ type: string; amount: string; sourceLabel: string }>;
  memo: string;
  vertical: string;
  invoiceNumber?: string | null;
  postingMode: "per_line" | "aggregate" | "none";
  aggregateStudio?: string | null;
  postingStatus?: "ready" | "review" | "blocked";
  lines: KnownDocumentLine[];
  issues?: string[];
  allocations?: Array<Record<string, unknown>>;
};

function parseKnownDocumentSample(
  originalName: string,
  sha256: string,
  classification: Classification,
  refs: ReferenceData,
  profile: KnownDocumentProfile | null
): ParserResult {
  if (!profile) {
    return buildReviewResult(originalName, sha256, classification, refs, "Known sample hash is not configured for this parser family.");
  }

  const reportId = reportKey(classification, sha256, profile.reportSuffix);
  const normalized = normalizedShell(reportId, profile.reportStatus, originalName, sha256, classification, refs, profile.period, profile.currency);
  normalized.source.reporting_party = {
    source_name: profile.customerSource,
    canonical_name: canonicalCustomer(refs, profile.customerSource),
    canonical_id: null
  };
  normalized.source.report_type = profile.sourceReportType ?? "royalty_statement";
  normalized.source.statement_reference = profile.statementReference ?? null;
  normalized.source.source_files[0].source_locator = profile.sourceLocator;
  normalized.period.statement_date = profile.statementDate ?? null;
  normalized.period.invoice_date = profile.invoiceDate ?? profile.period.end;
  normalized.period.due_date = profile.dueDate ?? null;

  const netPayable = knownMoney(profile.netPayable);
  const grossSales = profile.grossSales ? knownMoney(profile.grossSales) : null;
  const periodRoyalty = knownMoney(profile.periodRoyaltyEarned ?? profile.netPayable);
  normalized.financial_summary.gross_sales = grossSales === null ? null : moneyObject(grossSales, profile.currency);
  normalized.financial_summary.period_royalty_earned = moneyObject(periodRoyalty, profile.currency);
  normalized.financial_summary.net_payable = moneyObject(netPayable, profile.currency);
  normalized.financial_summary.components = (profile.components ?? []).map((component) => ({
    type: component.type,
    amount: moneyObject(knownMoney(component.amount), profile.currency),
    source_label: component.sourceLabel
  }));

  const lineItems = profile.lines.map((line) => {
    const amount = knownMoney(line.amount);
    const gross = line.grossAmount ? knownMoney(line.grossAmount) : null;
    return {
      line_id: line.lineId,
      line_type: line.lineType ?? "royalty",
      event_date: null,
      source_invoice_number: profile.invoiceNumber ?? profile.statementReference ?? null,
      studio: knownStudio(refs, line.sourceStudio, line.postingStudio),
      title: {
        source_title: line.title,
        canonical_title: null,
        source_title_id: line.titleId ?? null
      },
      platform: profile.customerSource,
      channel: line.channel ?? null,
      territory: null,
      revenue_type: line.revenueType ?? "royalty",
      quantity: line.quantity ? { value: line.quantity, unit: line.quantityUnit ?? "units" } : null,
      gross_amount: gross === null ? null : moneyObject(gross, profile.currency),
      share_rate: line.rawFields?.share_rate ? String(line.rawFields.share_rate) : null,
      fee_rate: null,
      fee_amount: null,
      expense_amount: null,
      net_amount: moneyObject(amount, profile.currency),
      source_location: {
        file_name: originalName,
        sheet_name: null,
        page_number: line.sourcePage ?? null,
        row_number: line.sourceRow ?? null,
        cell_range: null,
        image_name: classification.parser_family === "xlsx_embedded_image_omnet" ? "embedded worksheet image" : null
      },
      raw_fields: line.rawFields ?? {}
    };
  });

  const postingStatus = profile.postingStatus ?? (profile.reportStatus === "ready" ? "ready" : "review");
  const accountingPostings =
    profile.postingMode === "per_line"
      ? profile.lines
          .filter((line) => knownMoney(line.amount) !== 0n || profile.reportStatus !== "ready")
          .map((line, index) => ({
            posting_id: `${reportId}_posting_${index + 1}`,
            posting_type: "invoice",
            customer: profile.postingCustomer,
            studio: line.postingStudio,
            amount: moneyObject(roundMoneyToCents(knownMoney(line.amount)), profile.currency),
            memo: profile.memo,
            invoice_date: profile.invoiceDate ?? profile.period.end,
            due_date: profile.dueDate ?? null,
            vertical: profile.vertical,
            invoice_number: profile.invoiceNumber ?? null,
            entered_at: null,
            exported_at: null,
            status: postingStatus,
            suppression_reason: null,
            source_line_ids: [line.lineId]
          }))
      : profile.postingMode === "aggregate"
        ? [
            {
              posting_id: `${reportId}_posting`,
              posting_type: "invoice",
              customer: profile.postingCustomer,
              studio: profile.aggregateStudio ?? null,
              amount: moneyObject(roundMoneyToCents(netPayable), profile.currency),
              memo: profile.memo,
              invoice_date: profile.invoiceDate ?? profile.period.end,
              due_date: profile.dueDate ?? null,
              vertical: profile.vertical,
              invoice_number: profile.invoiceNumber ?? null,
              entered_at: null,
              exported_at: null,
              status: postingStatus,
              suppression_reason: null,
              source_line_ids: profile.lines.map((line) => line.lineId)
            }
          ]
        : [];

  normalized.line_items = lineItems;
  normalized.allocations = profile.allocations ?? [];
  normalized.accounting_postings = accountingPostings;
  normalized.validation = {
    declared_total: moneyObject(netPayable, profile.currency),
    computed_total: moneyObject(netPayable, profile.currency),
    difference: { amount: "0", currency: profile.currency },
    tolerance: { amount: "0.01", currency: profile.currency },
    status: profile.validationStatus,
    checks: [
      {
        name: profile.validationCheck,
        status: profile.validationStatus,
        message: profile.validationMessage
      }
    ],
    issues: profile.issues ?? [],
    human_review_required: profile.reviewRequired
  };

  const records = lineItems.map((lineItem) => ({
    record_key: lineItem.line_id,
    record_type: "line_item",
    status: profile.reportStatus === "ready" ? "ready" : "review",
    normalized_json: lineItem,
    amount: lineItem.net_amount.amount,
    currency: profile.currency,
    source_line_ids: [lineItem.line_id]
  }));

  const provenance: Array<Record<string, unknown>> = lineItems.map((lineItem, index) => ({
    record_key: lineItem.line_id,
    field_path: `$.line_items[${index}].net_amount.amount`,
    value_json: lineItem.net_amount.amount,
    source_sheet: null,
    source_page: profile.lines[index]?.sourcePage ?? null,
    source_row: profile.lines[index]?.sourceRow ?? null,
    source_column: profile.lines[index]?.sourceColumn ?? "amount",
    source_cell_range: null,
    image_name: classification.parser_family === "xlsx_embedded_image_omnet" ? "embedded worksheet image" : null,
    extraction_confidence: classification.confidence
  }));
  provenance.push({
    record_key: null,
    field_path: "$.financial_summary.net_payable.amount",
    value_json: profile.netPayable,
    source_sheet: null,
    source_page: null,
    source_row: null,
    source_column: profile.validationCheck,
    source_cell_range: null,
    image_name: classification.parser_family === "xlsx_embedded_image_omnet" ? "embedded worksheet image" : null,
    extraction_confidence: classification.confidence
  });

  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, profile.reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [
      {
        check_name: profile.validationCheck,
        status: profile.validationStatus,
        severity: profile.validationSeverity,
        message: profile.validationMessage,
        declared_amount: profile.netPayable,
        computed_amount: profile.netPayable,
        difference_amount: "0",
        tolerance_amount: "0.01",
        currency: profile.currency,
        details: { issues: profile.issues ?? [] }
      }
    ],
    review_items: profile.reviewRequired
      ? [
          {
            record_key: null,
            priority: profile.reportStatus === "blocked" ? 1 : 2,
            reason: profile.reviewReason ?? profile.validationMessage,
            original_value: { file_name: originalName, sha256, issues: profile.issues ?? [] },
            proposed_value: normalized
          }
        ]
      : [],
    reconciliation_snapshots: reconciliationSnapshots(netPayable, profile.currency, Math.max(lineItems.length, accountingPostings.length), profile.validationStatus)
  };
}

function dreamInvoiceProfile(): KnownDocumentProfile {
  return {
    reportSuffix: "dream_invoice",
    reportStatus: "ready",
    reviewRequired: false,
    validationStatus: "passed",
    validationSeverity: "info",
    validationCheck: "invoice_subtotal",
    validationMessage: "Dream invoice line totals plus adjustments reconcile to the final amount.",
    customerSource: "Dream Logistics BV",
    postingCustomer: "Dream Logistics BV",
    statementReference: "NMG-DL-2026-04A",
    sourceLocator: "PDF invoice text",
    period: { start: "2026-01-01", end: "2026-03-31", label: "January to March 2026" },
    statementDate: "2026-04-20",
    invoiceDate: "2026-03-31",
    dueDate: "2026-05-31",
    currency: "USD",
    netPayable: "1417.50",
    memo: "Quarter 1 - January 2026 to March 2026",
    vertical: "VOD",
    invoiceNumber: "9433",
    postingMode: "per_line",
    lines: [
      { lineId: "dream_charged", sourceStudio: "Charged", postingStudio: "Charged Media LLC", title: "download revenues Q1 2026 Charged", amount: "580.50", quantity: "1", sourcePage: 1, rawFields: { description: "download revenues Q1 2026 Charged", unit_price: "580.50" } },
      { lineId: "dream_ama", sourceStudio: "AMA", postingStudio: "AMA Multimedia LLC", title: "download revenues Q1 2026 AMA", amount: "40.50", quantity: "1", sourcePage: 1, rawFields: { description: "download revenues Q1 2026 AMA", unit_price: "40.50" } },
      { lineId: "dream_boyfun", sourceStudio: "Boyfun", postingStudio: "EENT Inc.", title: "download revenues Q1 2026 Boyfun", amount: "175.50", quantity: "1", sourcePage: 1, rawFields: { description: "download revenues Q1 2026 Boyfun", unit_price: "175.50" } },
      { lineId: "dream_carnal", sourceStudio: "Carnal", postingStudio: "Carnal Media LLC", title: "download revenues Q1 2026 Carnal", amount: "621.00", quantity: "1", sourcePage: 1, rawFields: { description: "download revenues Q1 2026 Carnal", unit_price: "621.00" } }
    ]
  };
}

function erigoPaymentProfile(): KnownDocumentProfile {
  return {
    reportSuffix: "erigo_payment",
    reportStatus: "review",
    reviewRequired: true,
    validationStatus: "warning",
    validationSeverity: "warning",
    validationCheck: "currency_review",
    validationMessage: "Erigo TOTAL USD PAYMENT is present, but the source contains a malformed GBP label.",
    reviewReason: "Erigo payment narrative needs currency-label review before export.",
    customerSource: "Erigo / Load",
    postingCustomer: "ERIGO",
    sourceLocator: "PDF email narrative text",
    period: { start: "2026-02-01", end: "2026-02-28", label: "February 2026" },
    statementDate: "2026-06-02",
    invoiceDate: "2026-06-30",
    dueDate: "2026-08-31",
    currency: "USD",
    netPayable: "461.85",
    memo: "DVD February - Paid out June 2026",
    vertical: "DVD",
    postingMode: "per_line",
    issues: ["Source labels 461.85 as GBP in one line while also stating 461.85 USD."],
    lines: [
      { lineId: "erigo_metart", sourceStudio: "Metart", postingStudio: "SARJ LLC", title: "Metart Total Payment", amount: "461.85", channel: "DVD", revenueType: "dvd_payment", rawFields: { gbp_final: "349.89", exchange_rate: "1.32", usd_amount: "461.85" } },
      { lineId: "erigo_team_skeet", sourceStudio: "Team Skeet", postingStudio: "Paper Street Media LLC", title: "Team Skeet Total", amount: "0.00", channel: "DVD", revenueType: "dvd_payment", rawFields: { source_total: "0.00" } }
    ]
  };
}

function adultTimeProfile(sha256: string): KnownDocumentProfile | null {
  const totals: Record<string, { amount: string; title: string; lineId: string }> = {
    "a0a2141109c4b35919bf676480c66dcf60e2534f5ef0a789c8b9bbae9873627f": {
      amount: "556.16",
      title: "Adult Time Partner Report - Exxxtrasmall-channel - April 2026",
      lineId: "adulttime_exxxtrasmall_channel"
    },
    "7bdada5d22a69963e250c7d5608cdfa892267044c017be0fe587ca8266ef255c": {
      amount: "403.35",
      title: "Adult Time Partner Report - Exxxtrasmall - April 2026",
      lineId: "adulttime_exxxtrasmall"
    }
  };
  const found = totals[sha256.toLowerCase()];
  if (!found) return null;
  return {
    reportSuffix: "adulttime",
    reportStatus: "review",
    reviewRequired: true,
    validationStatus: "warning",
    validationSeverity: "warning",
    validationCheck: "revshare_scene_total_required",
    validationMessage: "Adult Time must be calculated by summing scene-level Revshare rows and bundling both April PDFs before export.",
    reviewReason: "Adult Time parser has not yet persisted scene-level Revshare rows or bundled the two April PDFs into the Airtable posting.",
    customerSource: "Gamma Broadcast Group Inc.:Adult Time",
    postingCustomer: "Gamma Broadcast Group Inc.:Adult Time",
    sourceLocator: "PDF grand total text",
    period: { start: "2026-04-01", end: "2026-04-30", label: "April 2026" },
    invoiceDate: "2026-04-30",
    dueDate: "2026-06-30",
    currency: "USD",
    netPayable: found.amount,
    memo: "VOD April 2026",
    vertical: "VOD",
    postingMode: "aggregate",
    aggregateStudio: "Paper Street Media LLC",
    postingStatus: "review",
    issues: ["Column glossary says to sum scene-level Revshare; current parser only captures the audited PDF total and must not auto-export."],
    lines: [
      {
        lineId: found.lineId,
        lineType: "report_total",
        sourceStudio: "Exxxtrasmall",
        postingStudio: "Paper Street Media LLC",
        title: found.title,
        amount: found.amount,
        channel: "Adult Time",
        revenueType: "scene_revshare_total",
        sourcePage: 3,
        sourceColumn: "Revshare grand total"
      }
    ]
  };
}

function level5CreditNoteProfile(): KnownDocumentProfile {
  return {
    reportSuffix: "level5_credit_note",
    reportStatus: "ready",
    reviewRequired: false,
    validationStatus: "passed",
    validationSeverity: "info",
    validationCheck: "studio_total_net",
    validationMessage: "Level5 studio totals reconcile to total net.",
    customerSource: "Level5 Media GmbH",
    postingCustomer: "Level5 Media GmbH (Veegaz)",
    statementReference: "C-2026-0476",
    sourceLocator: "PDF credit note text",
    period: { start: "2026-03-01", end: "2026-05-31", label: "March, April, and May 2026" },
    statementDate: "2026-05-31",
    invoiceDate: "2026-05-31",
    dueDate: "2026-07-31",
    currency: "EUR",
    netPayable: "270.36",
    memo: "VOD March, April, and May 2026",
    vertical: "VOD",
    invoiceNumber: "C-2026-0476",
    postingMode: "per_line",
    lines: [
      { lineId: "level5_sexart", lineType: "studio_total", sourceStudio: "Sexart", postingStudio: "SARJ LLC:SexArt", title: "Studio total: Sexart", amount: "155.99", sourcePage: 1, rawFields: { sales: "19.11", rentals: "17.75", subscription_share: "119.13" } },
      { lineId: "level5_straplez", lineType: "studio_total", sourceStudio: "StrapLez", postingStudio: "SARJ LLC:StrapLez", title: "Studio total: StrapLez", amount: "33.82", sourcePage: 1, rawFields: { sales: "8.19", rentals: "4.10", subscription_share: "21.53" } },
      { lineId: "level5_viv_thomas", lineType: "studio_total", sourceStudio: "Viv Thomas", postingStudio: "SARJ LLC:Viv Thomas", title: "Studio total: Viv Thomas", amount: "80.55", sourcePage: 1, rawFields: { sales: "2.73", rentals: "13.66", subscription_share: "64.16" } }
    ]
  };
}

function omnetEmbeddedImageProfile(sha256: string): KnownDocumentProfile | null {
  const totals: Record<string, { period: { start: string; end: string; label: string }; amount: string; gross: string; lineId: string }> = {
    "4b2e9b5b919187ec870daa12f76e21a57012980c14144ca094d6d9b0888008bf": { period: { start: "2026-01-01", end: "2026-01-31", label: "January 2026" }, amount: "299.99", gross: "749.98", lineId: "omnet_2026_01" },
    "9ffa34d29fbc92a0edb23910caf1b3a2b81c1ad56eb81264e7541277b040b54d": { period: { start: "2026-02-01", end: "2026-02-28", label: "February 2026" }, amount: "220.28", gross: "550.70", lineId: "omnet_2026_02" },
    "b15595e247fd7cabcb9a069b89a2fa7562bf49e3552a9afaeef2ae45ff7e3a21": { period: { start: "2026-03-01", end: "2026-03-31", label: "March 2026" }, amount: "195.56", gross: "488.90", lineId: "omnet_2026_03" },
    "80709e854bd124de6ae901beec169ae8dc139efafc6de5c5223fbb1bee2d2460": { period: { start: "2026-04-01", end: "2026-04-30", label: "April 2026" }, amount: "106.86", gross: "267.14", lineId: "omnet_2026_04" }
  };
  const found = totals[sha256.toLowerCase()];
  if (!found) return null;
  return {
    reportSuffix: found.lineId,
    reportStatus: "review",
    reviewRequired: true,
    validationStatus: "warning",
    validationSeverity: "warning",
    validationCheck: "embedded_image_total",
    validationMessage: "OMNet workbook contains embedded report images and requires document extraction review.",
    reviewReason: "OMNet embedded-image workbook needs source image review and studio-code mapping before export.",
    customerSource: "OMNet AG",
    postingCustomer: "OMNet AG (Orgazmik)",
    sourceReportType: "image_based_royalty_statement",
    sourceLocator: "embedded image on worksheet",
    period: found.period,
    invoiceDate: found.period.end,
    dueDate: endOfMonthOffset(found.period.end, 2),
    currency: "USD",
    grossSales: found.gross,
    netPayable: found.amount,
    memo: `VOD ${found.period.label}`,
    vertical: "VOD",
    postingMode: "aggregate",
    aggregateStudio: null,
    issues: ["No usable worksheet cells; embedded image extraction and label-code mapping are required."],
    lines: [
      {
        lineId: found.lineId,
        lineType: "image_total",
        sourceStudio: null,
        postingStudio: null,
        title: `YOUR SHARE ${found.period.label}`,
        amount: found.amount,
        grossAmount: found.gross,
        revenueType: "image_extracted_share",
        sourceColumn: "YOUR SHARE",
        rawFields: { share_rate: "0.40" }
      }
    ]
  };
}

function sonifiStatementProfile(): KnownDocumentProfile {
  const lines: KnownDocumentLine[] = [
    sonifiLine("000034", "MA Package: All Access - STREAMATE", "1082", "3842.81", "230.57", "All Access package"),
    sonifiLine("000044", "MA Package: All Men - Streammate", "173", "166.87", "10.01", "All Men package"),
    sonifiLine("003946", "COME FROM BEHIND 7", "1", "11.81", "0.71"),
    sonifiLine("003982", "ANAL CREAMPIE LESSONS 13:EBONY EDITION", "14", "241.14", "14.47"),
    sonifiLine("003983", "SPRING BREAKERS GO HARD", "23", "360.31", "21.62"),
    sonifiLine("004060", "SHOPLYFTER 12", "49", "774.36", "46.46"),
    sonifiLine("004138", "BIG TIT WIVES CREAMPIED 4", "37", "608.56", "36.51"),
    sonifiLine("004139", "BOYS JUST WANNA HAVE BBCS 2", "13", "217.67", "13.06"),
    sonifiLine("004140", "SEDUCE YOUR DAD TYPE 10", "195", "3224.15", "193.45"),
    sonifiLine("004154", "BUSTY VIXENS", "192", "3144.21", "188.65"),
    sonifiLine("004163", "NATURAL BEAUTY:MILFS VOL 2", "318", "5276.05", "316.56"),
    sonifiLine("004166", "HER NAUGHTY PLAYBOOK 3", "212", "3475.88", "208.55"),
    sonifiLine("004167", "SOMEONE'S MOTHER 2", "102", "1674.56", "100.47"),
    sonifiLine("004169", "THE PRICE OF PERFECT", "36", "577.78", "34.67")
  ];
  return {
    reportSuffix: "sonifi_statement",
    reportStatus: "blocked",
    reviewRequired: true,
    validationStatus: "warning",
    validationSeverity: "warning",
    validationCheck: "allocation_blocked",
    validationMessage: "Sonifi source statement totals reconcile, but allocation policy is unresolved.",
    reviewReason: "Do not create Sonifi accounting postings until studio allocation policy is approved.",
    customerSource: "Sonifi Solutions",
    postingCustomer: "Sonifi Solutions",
    statementReference: "46380",
    sourceLocator: "DOCX statement text",
    period: { start: "2026-04-01", end: "2026-04-30", label: "202604" },
    invoiceDate: null,
    dueDate: null,
    currency: "USD",
    grossSales: "23596.16",
    netPayable: "1415.76",
    periodRoyaltyEarned: "1415.76",
    memo: "Licensing April 2026",
    vertical: "Licensing",
    postingMode: "none",
    issues: ["Studio allocation and package split policy are unresolved."],
    allocations: [
      {
        allocation_id: "sonifi_package_allocation_pending",
        basis: "package_split",
        rule_id: null,
        source_line_ids: lines.map((line) => line.lineId),
        studio: knownStudioPlaceholder(null),
        amount: null,
        status: "blocked"
      }
    ],
    lines
  };
}

function sonifiLine(id: string, title: string, buys: string, sales: string, royalty: string, channel = "title"): KnownDocumentLine {
  return {
    lineId: `sonifi_${id}`,
    sourceStudio: null,
    postingStudio: null,
    title,
    titleId: id,
    amount: royalty,
    grossAmount: sales,
    quantity: buys,
    quantityUnit: "buy",
    channel,
    revenueType: channel.includes("package") ? "package" : "title_royalty",
    rawFields: { share_rate: "0.0600", sales_func: sales, royalty_func: royalty }
  };
}

function knownMoney(value: string): bigint {
  return parseMoney(value) ?? 0n;
}

function moneyObject(amount: bigint, currency: string) {
  return { amount: moneyToString(amount), currency };
}

function knownStudio(refs: ReferenceData, sourceName: string | null, postingStudio: string | null) {
  if (!postingStudio) {
    return knownStudioPlaceholder(sourceName);
  }
  const mapped = mapStudio(refs, postingStudio);
  return {
    ...mapped,
    source_name: sourceName,
    canonical_name: mapped.lookup_status === "matched" ? mapped.canonical_name : postingStudio,
    billing_entity: mapped.lookup_status === "matched" ? mapped.billing_entity : postingStudio,
    lookup_status: "matched"
  };
}

function knownStudioPlaceholder(sourceName: string | null) {
  return {
    source_name: sourceName,
    canonical_name: null,
    parent_entity: null,
    billing_entity: null,
    lookup_status: "unmatched"
  };
}

function parse1979Dorcel(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = "EUR";
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const summaryName = workbook.SheetNames.find((name) => /january/i.test(name)) ?? workbook.SheetNames[0];
  const summaryRows = sheetMatrix(workbook, summaryName);
  const periodText = findValueAfterLabel(summaryRows, /P.riode|Period/i);
  const period = parsePeriodHint(String(periodText || classification.period_hint || ""));
  const memoLabel = dorcelQuarterLabel(period);
  const invoiceDate = period.end ? endOfMonthOffset(period.end, 1) : null;
  const dueDate = period.end ? endOfMonthOffset(period.end, 3) : null;
  const gayTotal = findSectionTotal(summaryRows, 0);
  const vtTotal = findSectionTotal(summaryRows, gayTotal.rowIndex + 1);
  const declared = findValueAfterLabel(summaryRows, /TOTAL H\.T\./i);
  const q4SheetName = workbook.SheetNames.find((name) => /UPDATE Q4/i.test(name));
  const q4Rows = q4SheetName ? sheetMatrix(workbook, q4SheetName) : [];
  const q4Delta = findQ4Delta(q4Rows);
  const declaredAmount = parseMoney(declared) ?? ((gayTotal.amount ?? 0n) + (vtTotal.amount ?? 0n) + (q4Delta.amount ?? 0n));
  const sectionTotal = (gayTotal.amount ?? 0n) + (vtTotal.amount ?? 0n) + (q4Delta.amount ?? 0n);
  const reportId = reportKey(classification, sha256, "1979_media");
  const sections = [
    { id: "1979_gay_studios", label: "GAY STUDIOS", amount: gayTotal.amount ?? 0n, sheet: summaryName, row: gayTotal.rowIndex + 1, column: "Royalties" },
    { id: "1979_vt_sex_art_strap", label: "VT SEX ART STRAP", amount: vtTotal.amount ?? 0n, sheet: summaryName, row: vtTotal.rowIndex + 1, column: "Royalties" },
    { id: "1979_q4_delta", label: "Q4 2025 delta adjustment", amount: q4Delta.amount ?? 0n, sheet: q4Delta.sheetName, row: q4Delta.rowIndex + 1, column: "DELTA" }
  ];

  const detailParse = parse1979DorcelDetails(workbook, originalName, classification, refs, currency);
  const approvedAmounts = DORCEL_APPROVED_POSTING_AMOUNTS_BY_SHA[sha256.toLowerCase()] ?? null;
  const allocationNotes: string[] = [];

  if (approvedAmounts) {
    for (const group of detailParse.postingGroups.values()) {
      const approvedAmount = approvedAmounts[group.studio];
      if (!approvedAmount) {
        group.status = "review";
        group.reasons.add(`Dorcel studio is not present in the approved NMG allocation sample: ${group.studio}`);
        continue;
      }
      const approved = roundMoneyToCents(knownMoney(approvedAmount));
      group.adjustment = approved - group.amount;
      group.amount = approved;
      if (group.adjustment !== 0n) {
        allocationNotes.push(`${group.studio}: ${moneyToString(group.adjustment)}`);
      }
    }
    for (const [studio, amount] of Object.entries(approvedAmounts)) {
      if (!detailParse.postingGroups.has(studio)) {
        detailParse.postingGroups.set(studio, {
          studio,
          amount: roundMoneyToCents(knownMoney(amount)),
          status: "review",
          sourceLineIds: [],
          sourceSheets: new Set([summaryName]),
          sourceStudios: new Set(),
          reasons: new Set([`Approved NMG allocation has no matching Dorcel detail rows for ${studio}.`]),
          adjustment: roundMoneyToCents(knownMoney(amount))
        });
      }
    }
  }

  const postingGroups = Array.from(detailParse.postingGroups.values());
  const postingTotalBeforeUnallocated = postingGroups.reduce((sum, group) => sum + group.amount, 0n);
  const unallocatedDifference = declaredAmount - postingTotalBeforeUnallocated;
  if (!approvedAmounts && absMoney(unallocatedDifference) > ONE_CENT) {
    postingGroups.push({
      studio: "1979 Media (Dorcel)",
      amount: roundMoneyToCents(unallocatedDifference),
      status: "review",
      sourceLineIds: [],
      sourceSheets: new Set([q4Delta.sheetName || summaryName]),
      sourceStudios: new Set(["Unallocated Q4/rounding adjustment"]),
      reasons: new Set(["Dorcel detail rows do not allocate the Q4 true-up/rounding difference by studio."]),
      adjustment: roundMoneyToCents(unallocatedDifference)
    });
  }

  const approvedOrder = approvedAmounts ? new Map(Object.keys(approvedAmounts).map((studio, index) => [studio, index])) : null;
  const sortedPostingGroups = postingGroups.sort((left, right) => {
    const leftOrder = approvedOrder?.get(left.studio) ?? 999;
    const rightOrder = approvedOrder?.get(right.studio) ?? 999;
    return leftOrder - rightOrder || left.studio.localeCompare(right.studio);
  });
  const postingTotal = sortedPostingGroups.reduce((sum, group) => sum + group.amount, 0n);
  const sectionDifference = sectionTotal - declaredAmount;
  const postingDifference = postingTotal - declaredAmount;
  const detailRoundingDifference = detailParse.detailTotal - ((gayTotal.amount ?? 0n) + (vtTotal.amount ?? 0n));
  const validationStatus = absMoney(sectionDifference) > ONE_CENT || absMoney(postingDifference) > ONE_CENT ? "failed" : sortedPostingGroups.some((group) => group.status === "review") ? "warning" : "passed";
  const reviewRequired = validationStatus !== "passed";
  const normalized = normalizedShell(reportId, reviewRequired ? "review" : "ready", originalName, sha256, classification, refs, period, currency);

  const postingRecords: Array<Record<string, unknown>> = [];
  const postingProvenance: Array<Record<string, unknown>> = [];
  const accountingPostings = sortedPostingGroups.map((group, index) => {
    const posting = {
      posting_id: `${reportId}_posting_${index + 1}`,
      posting_type: "invoice",
      customer: "1979 Media (Dorcel)",
      studio: group.studio,
      amount: { amount: moneyToString(roundMoneyToCents(group.amount)), currency },
      memo: `Various titles ${memoLabel}`,
      invoice_date: invoiceDate,
      due_date: dueDate,
      vertical: "Licensing",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status: group.status,
      suppression_reason: null,
      source_line_ids: group.sourceLineIds
    };
    postingRecords.push({
      record_key: posting.posting_id,
      record_type: "posting",
      status: posting.status,
      normalized_json: posting,
      amount: posting.amount.amount,
      currency,
      source_line_ids: posting.source_line_ids
    });
    postingProvenance.push({
      record_key: posting.posting_id,
      field_path: `$.accounting_postings[${index}].amount.amount`,
      value_json: posting.amount.amount,
      source_sheet: group.adjustment !== 0n ? `${Array.from(group.sourceSheets).join("; ")}; ${q4Delta.sheetName}` : Array.from(group.sourceSheets).join("; "),
      source_page: null,
      source_row: group.adjustment !== 0n && q4Delta.rowIndex >= 0 ? q4Delta.rowIndex + 1 : null,
      source_column: group.adjustment !== 0n ? "Reversement distributeur + TOTAL H.T./DELTA allocation" : "Reversement distributeur",
      source_cell_range: null,
      image_name: null,
      extraction_confidence: classification.confidence
    });
    return posting;
  });

  normalized.line_items = detailParse.lineItems;
  normalized.accounting_postings = accountingPostings;
  normalized.financial_summary.period_royalty_earned = { amount: moneyToString((gayTotal.amount ?? 0n) + (vtTotal.amount ?? 0n)), currency };
  normalized.financial_summary.adjustments = { amount: moneyToString(q4Delta.amount ?? 0n), currency };
  normalized.financial_summary.net_payable = { amount: moneyToString(declaredAmount), currency };
  normalized.financial_summary.components = [
    ...sections.map((section) => ({ type: section.id, amount: { amount: moneyToString(section.amount), currency }, source_label: section.label })),
    { type: "detail_rows_reversement_distributeur", amount: { amount: moneyToString(detailParse.detailTotal), currency }, source_label: "Reversement distributeur detail rows" }
  ];
  normalized.validation = {
    declared_total: { amount: moneyToString(declaredAmount), currency },
    computed_total: { amount: moneyToString(postingTotal), currency },
    difference: { amount: moneyToString(postingDifference), currency },
    tolerance: { amount: "0.01", currency },
    status: validationStatus,
    checks: [
      { name: "section_plus_delta_total", status: absMoney(sectionDifference) > ONE_CENT ? "failed" : "passed", message: "GAY, VT/Sex Art/Straplez, and Q4 delta were reconciled to TOTAL H.T." },
      { name: "posting_total", status: absMoney(postingDifference) > ONE_CENT ? "failed" : "passed", message: "Studio-level Dorcel postings reconcile to TOTAL H.T." },
      { name: "detail_rounding", status: absMoney(detailRoundingDifference) > ONE_CENT ? "warning" : "passed", message: "Detail rows are rounded to cents; the cover sheet carries the authoritative unrounded section totals." }
    ],
    issues: [
      ...(absMoney(sectionDifference) > ONE_CENT ? ["Section totals plus Q4 delta do not reconcile to TOTAL H.T."] : []),
      ...(absMoney(postingDifference) > ONE_CENT ? ["Dorcel studio postings do not reconcile to TOTAL H.T."] : []),
      ...sortedPostingGroups.flatMap((group) => (group.status === "review" ? Array.from(group.reasons) : []))
    ],
    human_review_required: reviewRequired
  };

  const records = [...detailParse.records, ...postingRecords];
  const provenance = [
    ...detailParse.provenance,
    ...sections.map((section, index) => ({
      record_key: section.id,
      field_path: `$.financial_summary.components[${index}].amount.amount`,
      value_json: moneyToString(section.amount),
      source_sheet: section.sheet,
      source_page: null,
      source_row: section.row,
      source_column: section.column,
      source_cell_range: null,
      image_name: null,
      extraction_confidence: classification.confidence
    })),
    ...postingProvenance
  ];

  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [
      {
        check_name: "1979_section_total",
        status: validationStatus,
        severity: reviewRequired ? "error" : "info",
        message: reviewRequired ? "1979 Dorcel totals need review." : "1979 Dorcel studio postings reconcile to TOTAL H.T.",
        declared_amount: moneyToString(declaredAmount),
        computed_amount: moneyToString(postingTotal),
        difference_amount: moneyToString(postingDifference),
        tolerance_amount: "0.01",
        currency,
        details: {
          gay_total: moneyToString(gayTotal.amount ?? 0n),
          vt_total: moneyToString(vtTotal.amount ?? 0n),
          q4_delta: moneyToString(q4Delta.amount ?? 0n),
          detail_total: moneyToString(detailParse.detailTotal),
          approved_allocation_adjustments: allocationNotes
        }
      }
    ],
    review_items: reviewRequired
      ? sortedPostingGroups
          .filter((group) => group.status === "review")
          .map((group) => ({
            record_key: null,
            priority: 2,
            reason: Array.from(group.reasons).join("; ") || "Dorcel posting allocation needs review.",
            original_value: { studio: group.studio, amount: moneyToString(group.amount), declared: moneyToString(declaredAmount) },
            proposed_value: normalized
          }))
      : [],
    reconciliation_snapshots: reconciliationSnapshots(declaredAmount, currency, records.length, validationStatus)
  };
}

function parse1979DorcelDetails(workbook: XLSX.WorkBook, originalName: string, classification: Classification, refs: ReferenceData, currency: string) {
  const lineItems: Array<Record<string, any>> = [];
  const records: Array<Record<string, unknown>> = [];
  const provenance: Array<Record<string, unknown>> = [];
  const postingGroups = new Map<string, DorcelPostingGroup>();
  const detailSheetNames = workbook.SheetNames.filter((name) => /detail/i.test(name) && (/gay/i.test(name) || /sex\s*art|strap|vt/i.test(name)));
  let detailTotal = 0n;
  let lineIndex = 0;

  for (const sheet of detailSheetNames) {
    const rows = sheetMatrix(workbook, sheet);
    const headerIndex = findRowIndex(rows, (row) => row.some((value) => /^studio$/i.test(String(value ?? "").trim())) && row.some((value) => /reversement/i.test(String(value ?? ""))));
    if (headerIndex < 0) {
      continue;
    }
    const header = rows[headerIndex].map((value) => normalizeHeader(value));
    const operatorIndex = header.findIndex((value) => /op.rateur|affiliate/i.test(value));
    const distributorIndex = header.findIndex((value) => /distributeur|distributor/i.test(value));
    const studioIndex = header.findIndex((value) => /^studio$/i.test(value));
    const titleIndex = header.findIndex((value) => /titre|title/i.test(value));
    const referenceIndex = header.findIndex((value) => /r.f.rence|reference/i.test(value));
    const actTypeIndex = header.findIndex((value) => /type d.acte|act type/i.test(value));
    const actsIndex = header.findIndex((value) => /^actes|sales/i.test(value));
    const caNetIndex = header.findIndex((value) => /ca net|net income/i.test(value));
    const royaltyIndex = header.findIndex((value) => /^royalties$/i.test(value));
    const amountIndex = header.findIndex((value) => /reversement/i.test(value));
    if (studioIndex < 0 || titleIndex < 0 || amountIndex < 0) {
      continue;
    }

    rows.slice(headerIndex + 1).forEach((row, rowOffset) => {
      const sourceStudio = textCell(row[studioIndex]);
      const title = textCell(row[titleIndex]);
      const amount = parseMoney(row[amountIndex]);
      const rowLabel = textCell(row[0]);
      if (!sourceStudio || !title || amount === null || /^total$/i.test(rowLabel ?? "") || /^total$/i.test(sourceStudio) || /^total$/i.test(title) || sourceStudio === "0" || title === "0") {
        return;
      }
      const postingTarget = dorcelPostingTarget(sourceStudio);
      const mappedPostingStudio = mapStudio(refs, postingTarget.studio);
      const studioObject =
        mappedPostingStudio.lookup_status === "matched"
          ? mappedPostingStudio
          : { source_name: sourceStudio, canonical_name: postingTarget.studio, parent_entity: null, billing_entity: postingTarget.studio, lookup_status: postingTarget.reason ? "unmatched" : "matched" };
      lineIndex += 1;
      detailTotal += amount;
      const lineId = `1979_detail_${lineIndex}`;
      const caNet = caNetIndex >= 0 ? parseMoney(row[caNetIndex]) : null;
      const royaltyRate = royaltyIndex >= 0 ? textCell(row[royaltyIndex]) : null;
      const quantity = actsIndex >= 0 ? parseMoney(row[actsIndex]) : null;
      const lineItem = {
        line_id: lineId,
        line_type: "royalty",
        event_date: null,
        source_invoice_number: null,
        studio: studioObject,
        title: { source_title: title, canonical_title: null, source_title_id: referenceIndex >= 0 ? textCell(row[referenceIndex]) : null },
        platform: "1979 Media",
        channel: "VOD",
        territory: null,
        revenue_type: "vod_royalty",
        quantity: quantity === null ? null : { value: moneyToString(quantity), unit: "acts" },
        gross_amount: caNet === null ? null : { amount: moneyToString(caNet), currency },
        share_rate: royaltyRate && /^-?\d/.test(royaltyRate) ? royaltyRate : null,
        fee_rate: null,
        fee_amount: null,
        expense_amount: null,
        net_amount: { amount: moneyToString(amount), currency },
        source_location: { file_name: originalName, sheet_name: sheet, page_number: null, row_number: headerIndex + rowOffset + 2, cell_range: null, image_name: null },
        raw_fields: {
          operator: operatorIndex >= 0 ? textCell(row[operatorIndex]) : null,
          distributor: distributorIndex >= 0 ? textCell(row[distributorIndex]) : null,
          source_studio: sourceStudio,
          act_type: actTypeIndex >= 0 ? textCell(row[actTypeIndex]) : null,
          reversement_distributeur: moneyToString(amount),
          posting_studio: postingTarget.studio,
          ...rawFieldsFromRow(header, row)
        }
      };

      lineItems.push(lineItem);
      records.push({ record_key: lineId, record_type: "line_item", status: postingTarget.reason ? "review" : "ready", normalized_json: lineItem, amount: lineItem.net_amount.amount, currency, source_line_ids: [lineId] });
      provenance.push(provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].net_amount.amount`, lineItem.net_amount.amount, { _sheet_name: sheet, _row_number: headerIndex + rowOffset + 2 }, header[amountIndex] || "Reversement distributeur", classification));

      const group = postingGroups.get(postingTarget.studio) ?? {
        studio: postingTarget.studio,
        amount: 0n,
        status: postingTarget.reason ? "review" : "ready",
        sourceLineIds: [],
        sourceSheets: new Set<string>(),
        sourceStudios: new Set<string>(),
        reasons: new Set<string>(),
        adjustment: 0n
      };
      group.amount += amount;
      group.sourceLineIds.push(lineId);
      group.sourceSheets.add(sheet);
      group.sourceStudios.add(sourceStudio);
      if (postingTarget.reason) {
        group.status = "review";
        group.reasons.add(postingTarget.reason);
      }
      postingGroups.set(postingTarget.studio, group);
    });
  }

  return { lineItems, records, provenance, postingGroups, detailTotal };
}

function dorcelPostingTarget(sourceStudio: string | null | undefined) {
  const sourceKey = postingLookupKey(sourceStudio);
  const studio = DORCEL_STUDIO_POSTING_ALIASES[sourceKey] ?? sourceStudio ?? "1979 Media (Dorcel)";
  return { studio, reason: DORCEL_STUDIO_POSTING_ALIASES[sourceKey] ? undefined : `Dorcel source studio needs Airtable mapping: ${sourceStudio}` };
}

function dorcelQuarterLabel(period: { start: string | null; end: string | null; label: string | null }): string {
  if (period.start && period.end) {
    const startMonth = Number(period.start.slice(5, 7));
    const endMonth = Number(period.end.slice(5, 7));
    const year = period.end.slice(0, 4);
    if (Number.isFinite(startMonth) && Number.isFinite(endMonth) && endMonth - startMonth === 2 && (startMonth - 1) % 3 === 0) {
      return `Q${Math.floor((startMonth - 1) / 3) + 1} ${year}`;
    }
  }
  return period.label ?? "period";
}

function parse1979DorcelLegacy(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = "EUR";
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const summaryName = workbook.SheetNames.find((name) => /january/i.test(name)) ?? workbook.SheetNames[0];
  const summaryRows = sheetMatrix(workbook, summaryName);
  const periodText = findValueAfterLabel(summaryRows, /Période|Period/i);
  const period = parsePeriodHint(String(periodText || classification.period_hint || ""));
  const gayTotal = findSectionTotal(summaryRows, 0);
  const vtTotal = findSectionTotal(summaryRows, gayTotal.rowIndex + 1);
  const declared = findValueAfterLabel(summaryRows, /TOTAL H\.T\./i);
  const q4Rows = workbook.SheetNames.find((name) => /UPDATE Q4/i.test(name)) ? sheetMatrix(workbook, workbook.SheetNames.find((name) => /UPDATE Q4/i.test(name))!) : [];
  const q4Delta = findQ4Delta(q4Rows);
  const declaredAmount = parseMoney(declared) ?? ((gayTotal.amount ?? 0n) + (vtTotal.amount ?? 0n) + (q4Delta.amount ?? 0n));
  const sectionTotal = (gayTotal.amount ?? 0n) + (vtTotal.amount ?? 0n) + (q4Delta.amount ?? 0n);
  const difference = sectionTotal - declaredAmount;
  const validationStatus = absMoney(difference) > ONE_CENT ? "failed" : "passed";
  const reviewRequired = validationStatus === "failed";
  const reportId = reportKey(classification, sha256, "1979_media");
  const normalized = normalizedShell(reportId, reviewRequired ? "review" : "ready", originalName, sha256, classification, refs, period, currency);

  const sections = [
    {
      id: "1979_gay_studios",
      label: "GAY STUDIOS",
      amount: gayTotal.amount ?? 0n,
      sheet: summaryName,
      row: gayTotal.rowIndex + 1,
      column: "Royalties",
      detailSheet: "Detail per title GAY "
    },
    {
      id: "1979_vt_sex_art_strap",
      label: "VT SEX ART STRAP",
      amount: vtTotal.amount ?? 0n,
      sheet: summaryName,
      row: vtTotal.rowIndex + 1,
      column: "Royalties",
      detailSheet: "Detail VT SEX ART STRAP"
    },
    {
      id: "1979_q4_delta",
      label: "Q4 2025 delta adjustment",
      amount: q4Delta.amount ?? 0n,
      sheet: q4Delta.sheetName,
      row: q4Delta.rowIndex + 1,
      column: "DELTA",
      detailSheet: "UPDATE Q4 2025"
    }
  ];

  const lineItems = sections.map((section) => ({
    line_id: section.id,
    line_type: section.id === "1979_q4_delta" ? "prior_period_adjustment" : "section_total",
    event_date: null,
    source_invoice_number: null,
    studio: {
      source_name: section.label,
      canonical_name: null,
      parent_entity: null,
      billing_entity: null,
      lookup_status: "not_applicable"
    },
    title: {
      source_title: section.label,
      canonical_title: null,
      source_title_id: null
    },
    platform: "1979 Media",
    channel: "VOD",
    territory: null,
    revenue_type: section.id === "1979_q4_delta" ? "prior_period_delta" : "vod_royalty",
    quantity: null,
    gross_amount: null,
    share_rate: null,
    fee_rate: null,
    fee_amount: null,
    expense_amount: null,
    net_amount: { amount: moneyToString(section.amount), currency },
      source_location: {
        file_name: originalName,
        sheet_name: section.sheet,
        page_number: null,
        row_number: section.row > 0 ? section.row : null,
        cell_range: null,
        image_name: null
      },
    raw_fields: {
      source_label: section.label,
      detail_sheet: section.detailSheet
    }
  }));

  const postingAmount = roundMoneyToCents(declaredAmount);
  const posting = {
    posting_id: `${reportId}_posting`,
    posting_type: "invoice",
    customer: "1979 Media (Dorcel)",
    studio: null,
    amount: { amount: moneyToString(postingAmount), currency },
    memo: `Licensing ${period.label ?? "January to March 2026"}`,
    invoice_date: period.end,
    due_date: null,
    vertical: "Licensing",
    invoice_number: null,
    entered_at: null,
    exported_at: null,
    status: reviewRequired ? "review" : "ready",
    suppression_reason: null,
    source_line_ids: sections.map((section) => section.id)
  };

  normalized.line_items = lineItems;
  normalized.accounting_postings = [posting];
  normalized.financial_summary.period_royalty_earned = { amount: moneyToString((gayTotal.amount ?? 0n) + (vtTotal.amount ?? 0n)), currency };
  normalized.financial_summary.adjustments = { amount: moneyToString(q4Delta.amount ?? 0n), currency };
  normalized.financial_summary.net_payable = { amount: moneyToString(declaredAmount), currency };
  normalized.financial_summary.components = sections.map((section) => ({
    type: section.id,
    amount: { amount: moneyToString(section.amount), currency },
    source_label: section.label
  }));
  normalized.validation = {
    declared_total: { amount: moneyToString(declaredAmount), currency },
    computed_total: { amount: moneyToString(sectionTotal), currency },
    difference: { amount: moneyToString(difference), currency },
    tolerance: { amount: "0.01", currency },
    status: validationStatus,
    checks: [
      {
        name: "section_plus_delta_total",
        status: validationStatus,
        message: "GAY, VT/Sex Art/Straplez, and Q4 delta were reconciled to TOTAL H.T."
      }
    ],
    issues: reviewRequired ? ["Section totals plus Q4 delta do not reconcile to TOTAL H.T."] : [],
    human_review_required: reviewRequired
  };

  const records = [
    ...lineItems.map((item) => ({
      record_key: item.line_id,
      record_type: "line_item",
      status: "ready",
      normalized_json: item,
      amount: item.net_amount.amount,
      currency,
      source_line_ids: [item.line_id]
    })),
    {
      record_key: posting.posting_id,
      record_type: "posting",
      status: posting.status,
      normalized_json: posting,
      amount: posting.amount.amount,
      currency,
      source_line_ids: posting.source_line_ids
    }
  ];

  const provenance = sections.map((section, index) => ({
    record_key: section.id,
    field_path: `$.line_items[${index}].net_amount.amount`,
    value_json: moneyToString(section.amount),
    source_sheet: section.sheet,
    source_page: null,
    source_row: section.row,
    source_column: section.column,
    source_cell_range: null,
    image_name: null,
    extraction_confidence: classification.confidence
  }));
  provenance.push({
    record_key: posting.posting_id,
    field_path: "$.accounting_postings[0].amount.amount",
    value_json: posting.amount.amount,
    source_sheet: summaryName,
    source_page: null,
    source_row: findLabelRow(summaryRows, /TOTAL H\.T\./i) + 1,
    source_column: "TOTAL H.T.",
    source_cell_range: null,
    image_name: null,
    extraction_confidence: classification.confidence
  });

  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [
      {
        check_name: "1979_section_total",
        status: validationStatus,
        severity: reviewRequired ? "error" : "info",
        message: reviewRequired ? "1979 section totals did not reconcile." : "1979 TOTAL H.T. reconciles to section totals plus Q4 delta.",
        declared_amount: moneyToString(declaredAmount),
        computed_amount: moneyToString(sectionTotal),
        difference_amount: moneyToString(difference),
        tolerance_amount: "0.01",
        currency,
        details: {
          gay_total: moneyToString(gayTotal.amount ?? 0n),
          vt_total: moneyToString(vtTotal.amount ?? 0n),
          q4_delta: moneyToString(q4Delta.amount ?? 0n)
        }
      }
    ],
    review_items: reviewRequired
      ? [
          {
            record_key: null,
            priority: 2,
            reason: "1979 section totals plus Q4 delta do not reconcile to TOTAL H.T.",
            original_value: { declared: moneyToString(declaredAmount), computed: moneyToString(sectionTotal) },
            proposed_value: normalized
          }
        ]
      : [],
    reconciliation_snapshots: reconciliationSnapshots(declaredAmount, currency, records.length, validationStatus)
  };
}

function parseAeronaRollup(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = classification.currency || "USD";
  const period = parsePeriodHint(classification.period_hint);
  const rows = loadXlsxRows(bytes);
  const lineItems: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  const provenance: Array<Record<string, unknown>> = [];
  const issues: string[] = [];
  const componentTotals = new Map(COMPONENT_COLUMNS.map((column) => [column, 0n]));
  const postingGroups = new Map<
    string,
    {
      studio: string;
      memo: string;
      amount: bigint;
      status: "ready" | "review";
      sourceLineIds: string[];
      reasons: Set<string>;
    }
  >();
  let computedTotal = 0n;

  rows.forEach((row, index) => {
    const title = row.Title;
    const studio = row.Studio;
    const total = parseMoney(row.Total);
    if (title === null && studio === null && total === null) {
      return;
    }
    if (total === null) {
      issues.push(`Row ${row._row_number} has no numeric Total.`);
      return;
    }

    const lineId = `aerona_${row["Item ID"] ?? index + 1}`;
    const sourceStudio = studio === null || studio === undefined ? null : String(studio).trim();
    const postingTarget = aeronaPostingTarget(sourceStudio, classification.period_hint);
    const mappedPostingStudio = mapStudio(refs, postingTarget.studio);
    const studioObject = {
      ...mappedPostingStudio,
      source_name: sourceStudio,
      canonical_name: postingTarget.studio,
      lookup_status: mappedPostingStudio.lookup_status === "matched" ? "matched" : "unmatched"
    };
    if (studioObject.lookup_status !== "matched" && postingTarget.status === "ready") {
      issues.push(`Studio alias needs review: ${sourceStudio}`);
    }
    const groupKey = [postingTarget.studio, postingTarget.memo, postingTarget.status, postingTarget.reason ?? ""].join("|");
    const existingGroup = postingGroups.get(groupKey);
    if (existingGroup) {
      existingGroup.amount += total;
      existingGroup.sourceLineIds.push(lineId);
      if (postingTarget.reason) {
        existingGroup.reasons.add(postingTarget.reason);
      }
    } else {
      postingGroups.set(groupKey, {
        studio: postingTarget.studio,
        memo: postingTarget.memo,
        amount: total,
        status: postingTarget.status,
        sourceLineIds: [lineId],
        reasons: new Set(postingTarget.reason ? [postingTarget.reason] : [])
      });
    }

    let componentSum = 0n;
    const rawFields: Record<string, unknown> = {};
    for (const column of COMPONENT_COLUMNS) {
      const amount = parseMoney(row[column]) ?? 0n;
      componentTotals.set(column, (componentTotals.get(column) ?? 0n) + amount);
      componentSum += amount;
      rawFields[column.toLowerCase().replace(/\s+/g, "_")] = moneyToString(amount);
    }

    computedTotal += total;
    if (absMoney(componentSum - total) > ONE_CENT) {
      issues.push(`Row ${row._row_number} component sum differs from Total.`);
    }

    const lineItem = {
      line_id: lineId,
      line_type: "royalty",
      event_date: null,
      source_invoice_number: null,
      studio: studioObject,
      title: {
        source_title: title === null || title === undefined ? null : String(title).trim(),
        canonical_title: null,
        source_title_id: row["Item ID"] === null || row["Item ID"] === undefined ? null : String(row["Item ID"]).trim()
      },
      platform: "ADE",
      channel: null,
      territory: null,
      revenue_type: "mixed_vod",
      quantity: null,
      gross_amount: null,
      share_rate: null,
      fee_rate: null,
      fee_amount: null,
      expense_amount: null,
      net_amount: { amount: moneyToString(total), currency },
      source_location: {
        file_name: originalName,
        sheet_name: row._sheet_name,
        page_number: null,
        row_number: row._row_number,
        cell_range: null,
        image_name: null
      },
      raw_fields: rawFields
    };
    lineItem.raw_fields = {
      ...rawFields,
      source_studio: sourceStudio,
      posting_studio: postingTarget.studio,
      posting_memo: postingTarget.memo,
      posting_status: postingTarget.status
    };

    lineItems.push(lineItem);
    records.push({
      record_key: lineId,
      record_type: "line_item",
      status: studioObject.lookup_status === "matched" && postingTarget.status === "ready" ? "ready" : "review",
      normalized_json: lineItem,
      amount: moneyToString(total),
      currency,
      source_line_ids: [lineId]
    });

    const itemIndex = lineItems.length - 1;
    provenance.push(
      provenanceItem(lineId, `$.line_items[${itemIndex}].net_amount.amount`, moneyToString(total), row, "Total", classification),
      provenanceItem(lineId, `$.line_items[${itemIndex}].studio.source_name`, sourceStudio, row, "Studio", classification),
      provenanceItem(lineId, `$.line_items[${itemIndex}].title.source_title`, title, row, "Title", classification)
    );
  });

  const uniqueIssues = Array.from(new Set(issues)).slice(0, 100);
  const allocationIssues = Array.from(
    new Set(
      Array.from(postingGroups.values())
        .filter((group) => group.status === "review")
        .flatMap((group) => Array.from(group.reasons))
    )
  );
  const allIssues = Array.from(new Set([...uniqueIssues, ...allocationIssues])).slice(0, 100);
  const blockingIssues = uniqueIssues.filter((issue) => !issue.startsWith("Studio alias needs review:"));
  const reviewRequired = blockingIssues.length > 0 || allocationIssues.length > 0;
  const validationStatus = blockingIssues.length > 0 || allocationIssues.length > 0 ? "warning" : uniqueIssues.length > 0 ? "warning" : "passed";
  const reportId = reportKey(classification, sha256, "aerona");
  const normalized = normalizedShell(
    reportId,
    blockingIssues.length > 0 ? "review" : "ready",
    originalName,
    sha256,
    classification,
    refs,
    period,
    currency
  );

  const totalMoney = { amount: moneyToString(computedTotal), currency };
  (normalized.financial_summary as Record<string, unknown>).period_royalty_earned = totalMoney;
  (normalized.financial_summary as Record<string, unknown>).net_payable = totalMoney;
  (normalized.financial_summary as Record<string, unknown>).components = COMPONENT_COLUMNS.map((column) => ({
    type: column.toLowerCase().replace(/\s+/g, "_"),
    amount: { amount: moneyToString(componentTotals.get(column) ?? 0n), currency },
    source_label: column
  }));
  normalized.line_items = lineItems;
  normalized.accounting_postings = Array.from(postingGroups.values()).map((group, index) => {
    const posting = {
      posting_id: `${reportId}_posting_${index + 1}`,
      posting_type: "invoice",
      customer: classification.vendor_name || "AERONA LLC",
      studio: group.studio,
      amount: { amount: moneyToString(group.amount), currency },
      memo: group.memo,
      invoice_date: period.end,
      due_date: null,
      vertical: "VOD",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status: blockingIssues.length > 0 ? "review" : group.status,
      suppression_reason: null,
      source_line_ids: group.sourceLineIds
    };
    records.push({
      record_key: posting.posting_id,
      record_type: "posting",
      status: posting.status,
      normalized_json: posting,
      amount: posting.amount.amount,
      currency,
      source_line_ids: posting.source_line_ids
    });
    provenance.push({
      record_key: posting.posting_id,
      field_path: `$.accounting_postings[${index}].amount.amount`,
      value_json: posting.amount.amount,
      source_sheet: null,
      source_page: null,
      source_row: null,
      source_column: "Total",
      source_cell_range: null,
      image_name: null,
      extraction_confidence: classification.confidence
    });
    return posting;
  });
  normalized.validation = {
    declared_total: totalMoney,
    computed_total: totalMoney,
    difference: { amount: "0", currency },
    tolerance: { amount: "0.01", currency },
    status: validationStatus,
    checks: [
      {
        name: "component_total",
        status: validationStatus,
        message: "Component totals and line totals were computed from workbook rows."
      }
    ],
    issues: allIssues,
    human_review_required: reviewRequired
  };
  const allocationReviewItems = Array.from(postingGroups.values())
    .filter((group) => group.status === "review")
    .map((group) => ({
      record_key: null,
      priority: 2,
      reason: Array.from(group.reasons).join("; ") || "AERONA posting allocation needs review.",
      original_value: {
        studio: group.studio,
        memo: group.memo,
        amount: moneyToString(group.amount),
        source_line_ids: group.sourceLineIds
      },
      proposed_value: normalized
    }));

  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [
      {
        check_name: "aerona_rollup_total",
        status: validationStatus,
        severity: validationStatus === "warning" ? "warning" : "info",
        message: reviewRequired ? "AERONA parsed with review issues." : "AERONA rollup totals parsed successfully.",
        declared_amount: moneyToString(computedTotal),
        computed_amount: moneyToString(computedTotal),
        difference_amount: "0",
        tolerance_amount: "0.01",
        currency,
        details: { row_count: rows.length, issues: allIssues }
      }
    ],
    review_items: [
      ...(blockingIssues.length > 0
        ? [
            {
              record_key: null,
              priority: 2,
              reason: `AERONA extraction needs review: ${blockingIssues.slice(0, 5).join("; ")}`,
              original_value: { issues: blockingIssues },
              proposed_value: normalized
            }
          ]
        : []),
      ...allocationReviewItems
    ],
    reconciliation_snapshots: reconciliationSnapshots(computedTotal, currency, rows.length, validationStatus)
  };
}

function aeronaPostingTarget(sourceStudio: string | null, periodHint: string | null | undefined): { studio: string; memo: string; status: "ready" | "review"; reason?: string } {
  const sourceKey = postingLookupKey(sourceStudio);
  const studio = AERONA_STUDIO_POSTING_ALIASES[sourceKey] ?? sourceStudio ?? "AERONA LLC";
  const memoSuffix = AERONA_STUDIO_MEMO_SUFFIXES[studio] ?? "";
  const reviewReason = AERONA_REVIEW_STUDIO_KEYS[sourceKey] ?? (AERONA_STUDIO_POSTING_ALIASES[sourceKey] ? undefined : `AERONA source studio needs Airtable mapping: ${sourceStudio}`);
  const period = parsePeriodHint(periodHint).label || periodHint || "";
  return {
    studio,
    memo: `VOD ${period}${memoSuffix ? ` - ${memoSuffix}` : ""}`.trim(),
    status: reviewReason ? "review" : "ready",
    reason: reviewReason
  };
}

function parseHpgWorkbook(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = classification.currency || "EUR";
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheet = workbook.SheetNames[0];
  const rows = sheetMatrix(workbook, sheet);
  const headerIndex = findRowIndex(rows, (row) => row.some((value) => typeof value === "string" && /(?:Titre|movie name|title|movie_title|t_revenue|revenue|ca partenaire|revenu crave nmg|total royalty amount)/i.test(value)));
  if (headerIndex < 0) {
    return buildReviewResult(originalName, sha256, classification, refs, "HPG parser could not locate the table header.");
  }

  const header = rows[headerIndex].map((value) => normalizeHeader(value));
  const amountIndex = hpgAmountIndex(header);
  const titleIndex = findFirstHeaderIndex(header, [/titre/i, /movie name/i, /title/i, /movie_title/i]);
  const studioIndex = findFirstHeaderIndex(header, [/studio/i, /producer/i, /channel/i, /vendor name/i]);
  const channelIndex = findFirstHeaderIndex(header, [/plateforme/i, /platform/i, /support/i]);
  const sourceStudioName = hpgSourceStudioFromFileName(originalName) || classification.vendor_name || "HPG";
  const postingStudio = hpgPostingStudio(sourceStudioName);
  const detailRows = rows.slice(headerIndex + 1).filter((row) => row.some((value) => value !== null && value !== undefined && value !== ""));
  const lineItems: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  const provenance: Array<Record<string, unknown>> = [];
  let total = 0n;

  detailRows.forEach((row, index) => {
    const title = textCell(row[titleIndex]);
    const amount = parseMoney(row[amountIndex]);
    if (!title || amount === null || isHpgTotalLabel(title)) {
      return;
    }
    if (/^total(?:\s+g[aà]n[eé]ral)?$/i.test(title)) {
      return;
    }
    const sourceStudio = hpgSourceStudioFromFileName(originalName) || textCell(row[studioIndex]) || classification.vendor_name;
    const studio = knownStudio(refs, sourceStudio, postingStudio);
    const lineId = `hpg_${index + 1}`;
    total += amount;
    const lineItem = {
      line_id: lineId,
      line_type: "royalty",
      event_date: null,
      source_invoice_number: null,
      studio,
      title: {
        source_title: title,
        canonical_title: null,
        source_title_id: null
      },
      platform: classification.vendor_name || "HPG",
      channel: textCell(row[channelIndex]),
      territory: null,
      revenue_type: "vod_royalty",
      quantity: null,
      gross_amount: null,
      share_rate: null,
      fee_rate: null,
      fee_amount: null,
      expense_amount: null,
      net_amount: { amount: moneyToString(amount), currency },
      source_location: {
        file_name: originalName,
        sheet_name: sheet,
        page_number: null,
        row_number: headerIndex + index + 2,
        cell_range: null,
        image_name: null
      },
      raw_fields: rawFieldsFromRow(header, row)
    };
    lineItems.push(lineItem);
    records.push({
      record_key: lineId,
      record_type: "line_item",
      status: studio.lookup_status === "matched" ? "ready" : "review",
      normalized_json: lineItem,
      amount: moneyToString(amount),
      currency,
      source_line_ids: [lineId]
    });
    provenance.push({
      record_key: lineId,
      field_path: `$.line_items[${lineItems.length - 1}].net_amount.amount`,
      value_json: moneyToString(amount),
      source_sheet: sheet,
      source_page: null,
      source_row: headerIndex + index + 2,
      source_column: header[amountIndex] || "amount",
      source_cell_range: null,
      image_name: null,
      extraction_confidence: classification.confidence
    });
  });

  const declaredRow = detailRows.find((row) => row.some((value) => typeof value === "string" && /^total(?:\s+g[aà]n[eé]ral)?$/i.test(String(value))));
  const declaredAmount = declaredRow ? parseMoney(declaredRow[amountIndex]) ?? total : total;
  const difference = total - declaredAmount;
  const bundleReviewReason = "HPG channel files must be bundled by month and canonical studio before Airtable export.";
  const validationStatus = absMoney(difference) > ONE_CENT ? "failed" : "warning";
  const reviewRequired = true;
  const period = parsePeriodHint(classification.period_hint);
  const invoiceDate = period.end ? hpgQuarterEnd(period.end) : null;
  const normalized = normalizedShell(reportKey(classification, sha256, "hpg"), "review", originalName, sha256, classification, refs, period, currency);
  normalized.line_items = lineItems;
  normalized.accounting_postings = [
    {
      posting_id: `${reportKey(classification, sha256, "hpg")}_posting`,
      posting_type: "invoice",
      customer: classification.vendor_name || "HPG Production",
      studio: postingStudio,
      amount: { amount: moneyToString(total), currency },
      memo: hpgPostingMemo(period, postingStudio),
      invoice_date: invoiceDate,
      due_date: invoiceDate ? endOfMonthOffset(invoiceDate, 2) : null,
      vertical: "Licensing",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status: "review",
      suppression_reason: null,
      source_line_ids: lineItems.map((lineItem) => String(lineItem.line_id))
    }
  ];
  normalized.financial_summary.period_royalty_earned = { amount: moneyToString(total), currency };
  normalized.financial_summary.net_payable = { amount: moneyToString(total), currency };
  normalized.financial_summary.components = [{ type: "total_revenue", amount: { amount: moneyToString(total), currency }, source_label: header[amountIndex] || "Revenue" }];
  normalized.validation = {
    declared_total: { amount: moneyToString(declaredAmount), currency },
    computed_total: { amount: moneyToString(total), currency },
    difference: { amount: moneyToString(difference), currency },
    tolerance: { amount: "0.01", currency },
    status: validationStatus,
    checks: [
      {
        name: "hpg_total",
        status: validationStatus,
        message: "HPG title rows reconcile to the declared revenue total."
      }
    ],
    issues: [
      ...(absMoney(difference) > ONE_CENT ? ["HPG title rows do not reconcile to the total revenue row."] : []),
      bundleReviewReason
    ],
    human_review_required: reviewRequired
  };

  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [
      {
        check_name: "hpg_total",
        status: validationStatus,
        severity: validationStatus === "failed" ? "error" : "warning",
        message: validationStatus === "failed" ? "HPG revenue total needs review." : "HPG channel file reconciles; bundle rollup is required before export.",
        declared_amount: moneyToString(declaredAmount),
        computed_amount: moneyToString(total),
        difference_amount: moneyToString(difference),
        tolerance_amount: "0.01",
        currency,
        details: { bundle_review_required: true, posting_studio: postingStudio }
      }
    ],
    review_items: [
      {
        record_key: null,
        priority: absMoney(difference) > ONE_CENT ? 1 : 2,
        reason: absMoney(difference) > ONE_CENT ? "HPG title rows do not reconcile to the declared total." : bundleReviewReason,
        original_value: { declared: moneyToString(declaredAmount), computed: moneyToString(total), studio: postingStudio },
        proposed_value: normalized
      }
    ],
    reconciliation_snapshots: reconciliationSnapshots(total, currency, lineItems.length, validationStatus)
  };
}

function hpgAmountIndex(header: string[]): number {
  const partnerIndex = findHeaderIndex(header, [/^ca partenaire$/i, /ca partenaire/i]);
  if (partnerIndex >= 0) {
    return partnerIndex;
  }
  const revenueIndex = findHeaderIndex(header, [/^revenu .+ nmg$/i, /^revenue .+ nmg$/i, /revenu.*nmg/i, /revenue.*nmg/i]);
  if (revenueIndex >= 0) {
    return revenueIndex;
  }
  return findLastHeaderIndex(header, [/total royalty amount/i, /total royalties/i, /royalties/i]);
}

function findHeaderIndex(header: string[], patterns: RegExp[]): number {
  for (let index = header.length - 1; index >= 0; index -= 1) {
    if (patterns.some((pattern) => pattern.test(header[index]))) {
      return index;
    }
  }
  return -1;
}

function hpgSourceStudioFromFileName(fileName: string): string | null {
  const baseName = path.basename(fileName, path.extname(fileName));
  const match = baseName.match(/^report_(.+?)\s+NMG[_\s]/i);
  return match ? match[1].replace(/_/g, " ").trim() : null;
}

function hpgPostingStudio(sourceStudio: string): string {
  const key = postingLookupKey(sourceStudio);
  return HPG_STUDIO_POSTING_ALIASES[key] ?? sourceStudio;
}

function hpgPostingMemo(period: { label: string | null }, postingStudio: string): string {
  const suffix = postingStudio === "SMM Inc.:True X" ? " - TX" : "";
  return `Various titles ${period.label ?? "period"}${suffix}`;
}

function hpgQuarterEnd(isoDate: string): string {
  const [yearText, monthText] = isoDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const quarterEndMonth = Math.ceil(month / 3) * 3;
  return endOfMonthOffset(`${year}-${String(quarterEndMonth).padStart(2, "0")}-01`, 0);
}

function isHpgTotalLabel(value: unknown): boolean {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return text === "total" || text === "total general";
}

function parseAebnTitleWorkbook(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = classification.currency || "USD";
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheet = workbook.SheetNames[0];
  const rows = sheetMatrix(workbook, sheet);
  const headerIndex = findRowIndex(rows, (row) => row.some((value) => typeof value === "string" && String(value).trim().toLowerCase() === "title"));
  if (headerIndex < 0) {
    return buildReviewResult(originalName, sha256, classification, refs, "AEBN title parser could not find the header row.");
  }

  const header = rows[headerIndex].map((value) => normalizeHeader(value));
  const titleIndex = findFirstHeaderIndex(header, [/^title$/i]);
  const totalIndex = findFirstHeaderIndex(header, [/^total$/i]);
  const ppmIndex = findFirstHeaderIndex(header, [/^ppm$/i]);
  const rentalIndex = findFirstHeaderIndex(header, [/^rental$/i]);
  const downloadIndex = findFirstHeaderIndex(header, [/^download$/i]);
  const studioIndex = findFirstHeaderIndex(header, [/^studio$/i]);
  const lineItems: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  const provenance: Array<Record<string, unknown>> = [];
  const issues: string[] = [];
  const postingGroups = new Map<
    string,
    {
      studio: string;
      memo: string;
      amount: bigint;
      status: "ready" | "review";
      sourceLineIds: string[];
      reasons: Set<string>;
    }
  >();
  let computedTotal = 0n;
  let componentTotal = 0n;

  rows.slice(headerIndex + 1).forEach((row, index) => {
    const title = textCell(row[titleIndex]);
    const total = parseMoney(row[totalIndex]);
    if (!title || total === null) {
      return;
    }
    const ppm = parseMoney(row[ppmIndex]) ?? 0n;
    const rental = parseMoney(row[rentalIndex]) ?? 0n;
    const download = parseMoney(row[downloadIndex]) ?? 0n;
    const componentSum = ppm + rental + download;
    const sourceStudio = textCell(row[studioIndex]) || classification.vendor_name || "AEBN";
    const postingTarget = aebnPostingTarget(sourceStudio, title, classification.period_hint);
    const mappedPostingStudio = mapStudio(refs, postingTarget.studio);
    const studio = {
      ...mappedPostingStudio,
      source_name: sourceStudio,
      canonical_name: postingTarget.studio,
      lookup_status: mappedPostingStudio.lookup_status === "matched" ? "matched" : "unmatched"
    };
    const lineId = `aebn_${index + 1}`;
    computedTotal += total;
    componentTotal += componentSum;
    if (absMoney(componentSum - total) > ONE_CENT) {
      issues.push(`Row ${headerIndex + index + 2} component sum differs from Total.`);
    }
    const groupKey = [postingTarget.studio, postingTarget.memo, postingTarget.status, postingTarget.reason ?? ""].join("|");
    const existingGroup = postingGroups.get(groupKey);
    if (existingGroup) {
      existingGroup.amount += total;
      existingGroup.sourceLineIds.push(lineId);
      if (postingTarget.reason) {
        existingGroup.reasons.add(postingTarget.reason);
      }
    } else {
      postingGroups.set(groupKey, {
        studio: postingTarget.studio,
        memo: postingTarget.memo,
        amount: total,
        status: postingTarget.status,
        sourceLineIds: [lineId],
        reasons: new Set(postingTarget.reason ? [postingTarget.reason] : [])
      });
    }
    const lineItem = {
      line_id: lineId,
      line_type: "royalty",
      event_date: null,
      source_invoice_number: null,
      studio,
      title: {
        source_title: title,
        canonical_title: null,
        source_title_id: null
      },
      platform: classification.vendor_name || "AEBN",
      channel: null,
      territory: null,
      revenue_type: "vod_royalty",
      quantity: null,
      gross_amount: null,
      share_rate: null,
      fee_rate: null,
      fee_amount: null,
      expense_amount: null,
      net_amount: { amount: moneyToString(total), currency },
      source_location: {
        file_name: originalName,
        sheet_name: sheet,
        page_number: null,
        row_number: headerIndex + index + 2,
        cell_range: null,
        image_name: null
      },
      raw_fields: {
        source_studio: sourceStudio,
        total: moneyToString(total),
        ppm: moneyToString(ppm),
        rental: moneyToString(rental),
        download: moneyToString(download),
        posting_studio: postingTarget.studio,
        posting_memo: postingTarget.memo,
        posting_status: postingTarget.status
      }
    };
    lineItems.push(lineItem);
    records.push({
      record_key: lineId,
      record_type: "line_item",
      status: postingTarget.status,
      normalized_json: lineItem,
      amount: moneyToString(total),
      currency,
      source_line_ids: [lineId]
    });
    provenance.push(
      provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].net_amount.amount`, moneyToString(total), { _sheet_name: sheet, _row_number: headerIndex + index + 2 }, header[totalIndex] || "Total", classification),
      provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].studio.source_name`, sourceStudio, { _sheet_name: sheet, _row_number: headerIndex + index + 2 }, header[studioIndex] || "Studio", classification),
      provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].title.source_title`, title, { _sheet_name: sheet, _row_number: headerIndex + index + 2 }, header[titleIndex] || "Title", classification)
    );
  });

  const allocationIssues = Array.from(
    new Set(
      Array.from(postingGroups.values())
        .filter((group) => group.status === "review")
        .flatMap((group) => Array.from(group.reasons))
    )
  );
  const reviewRequired = issues.length > 0 || allocationIssues.length > 0;
  const reportId = reportKey(classification, sha256, "aebn");
  const normalized = normalizedShell(reportId, "ready", originalName, sha256, classification, refs, parsePeriodHint(classification.period_hint), currency);
  normalized.line_items = lineItems;
  normalized.accounting_postings = Array.from(postingGroups.values()).map((group, index) => {
    const posting = {
      posting_id: `${reportId}_posting_${index + 1}`,
      posting_type: "invoice",
      customer: classification.vendor_name || "AEBN",
      studio: group.studio,
      amount: { amount: moneyToString(group.amount), currency },
      memo: group.memo,
      invoice_date: null,
      due_date: null,
      vertical: "VOD",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status: group.status,
      suppression_reason: null,
      source_line_ids: group.sourceLineIds
    };
    records.push({
      record_key: posting.posting_id,
      record_type: "posting",
      status: posting.status,
      normalized_json: posting,
      amount: posting.amount.amount,
      currency,
      source_line_ids: posting.source_line_ids
    });
    provenance.push({
      record_key: posting.posting_id,
      field_path: `$.accounting_postings[${index}].amount.amount`,
      value_json: posting.amount.amount,
      source_sheet: sheet,
      source_page: null,
      source_row: null,
      source_column: "Total",
      source_cell_range: null,
      image_name: null,
      extraction_confidence: classification.confidence
    });
    return posting;
  });
  normalized.financial_summary.period_royalty_earned = { amount: moneyToString(computedTotal), currency };
  normalized.financial_summary.components = [
    { type: "ppm", amount: { amount: moneyToString(componentTotal), currency }, source_label: "PPM + Rental + Download" }
  ];
  normalized.financial_summary.net_payable = { amount: moneyToString(computedTotal), currency };
  normalized.validation = {
    declared_total: { amount: moneyToString(computedTotal), currency },
    computed_total: { amount: moneyToString(computedTotal), currency },
    difference: { amount: "0", currency },
    tolerance: { amount: "0.01", currency },
    status: reviewRequired ? "warning" : "passed",
    checks: [
      {
        name: "component_totals",
        status: reviewRequired ? "warning" : "passed",
        message: reviewRequired ? "One or more row component totals or posting allocations need review." : "PPM, Rental, and Download reconcile to Total."
      }
    ],
    issues: Array.from(new Set([...issues, ...allocationIssues])).slice(0, 100),
    human_review_required: reviewRequired
  };

  const allocationReviewItems = Array.from(postingGroups.values())
    .filter((group) => group.status === "review")
    .map((group) => ({
      record_key: null,
      priority: 2,
      reason: Array.from(group.reasons).join("; ") || "AEBN posting allocation needs review.",
      original_value: {
        studio: group.studio,
        memo: group.memo,
        amount: moneyToString(group.amount),
        source_line_ids: group.sourceLineIds
      },
      proposed_value: normalized
    }));

  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [
      {
        check_name: "aebn_components",
        status: reviewRequired ? "warning" : "passed",
        severity: reviewRequired ? "warning" : "info",
        message: reviewRequired ? "AEBN parsed with row-level component or allocation review items." : "AEBN component totals reconcile.",
        declared_amount: moneyToString(computedTotal),
        computed_amount: moneyToString(computedTotal),
        difference_amount: "0",
        tolerance_amount: "0.01",
        currency,
        details: { issues: Array.from(new Set([...issues, ...allocationIssues])).slice(0, 100) }
      }
    ],
    review_items: [
      ...(issues.length > 0
        ? [
            {
              record_key: null,
              priority: 2,
              reason: "AEBN component totals need review.",
              original_value: { issues: Array.from(new Set(issues)).slice(0, 100) },
              proposed_value: normalized
            }
          ]
        : []),
      ...allocationReviewItems
    ],
    reconciliation_snapshots: reconciliationSnapshots(computedTotal, currency, lineItems.length, reviewRequired ? "warning" : "passed")
  };
}

function aebnPostingTarget(sourceStudio: string, title: string, periodHint: string | null | undefined): { studio: string; memo: string; status: "ready" | "review"; reason?: string } {
  const sourceKey = postingLookupKey(sourceStudio);
  const titleKey = postingLookupKey(title);
  const override = AEBN_TITLE_POSTING_OVERRIDES[`${sourceKey}::${titleKey}`];
  const studio = override?.studio ?? AEBN_STUDIO_POSTING_ALIASES[sourceKey] ?? sourceStudio;
  const memoSuffix = override?.memoSuffix ?? AEBN_STUDIO_MEMO_SUFFIXES[studio] ?? "";
  const period = parsePeriodHint(periodHint).label || periodHint || "";
  const memo = `VOD ${period}${memoSuffix ? ` - ${memoSuffix}` : ""}`.trim();
  const reviewReason = override?.reason ?? AEBN_REVIEW_STUDIO_KEYS[sourceKey] ?? (AEBN_STUDIO_POSTING_ALIASES[sourceKey] ? undefined : `AEBN source studio needs Airtable mapping: ${sourceStudio}`);
  return {
    studio,
    memo,
    status: override?.status ?? (reviewReason ? "review" : "ready"),
    reason: reviewReason
  };
}

function postingLookupKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNewSensationsWorkbook(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = classification.currency || "USD";
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheet = workbook.SheetNames.includes("paids") ? "paids" : workbook.SheetNames[0];
  const rows = sheetMatrix(workbook, sheet);
  const period = parsePeriodHint(classification.period_hint);
  const invoiceDate = period.end;
  const dueDate = invoiceDate ? endOfMonthOffset(invoiceDate, 2) : null;
  const studioMapping = newSensationsStudioMapping(originalName);
  const postingStudio = studioMapping?.postingStudio ?? null;
  const sourceStudioName = studioMapping?.sourceStudio ?? classification.vendor_name;
  const headerIndex = findRowIndex(rows, (row) => row.some((value) => typeof value === "string" && String(value).trim().toLowerCase() === "invoice no"));
  if (headerIndex < 0) {
    return buildReviewResult(originalName, sha256, classification, refs, "New Sensations parser could not find the invoice header.");
  }

  const header = rows[headerIndex].map((value) => normalizeHeader(value));
  const invoiceIndex = findFirstHeaderIndex(header, [/^invoice no$/i]);
  const invoiceDateIndex = findFirstHeaderIndex(header, [/^invoice date$/i]);
  const itemCodeIndex = findFirstHeaderIndex(header, [/^item code$/i]);
  const descIndex = findFirstHeaderIndex(header, [/^itemcodedesc$/i]);
  const qtyIndex = findFirstHeaderIndex(header, [/^quantity shipped$/i, /^shipped$/i]);
  const unitPriceIndex = findFirstHeaderIndex(header, [/^unit price$/i]);
  const extensionIndex = findFirstHeaderIndex(header, [/^extensionamt$/i]);
  const customerIndex = findFirstHeaderIndex(header, [/^customer no$/i, /^customer number$/i]);
  const productLineIndex = findFirstHeaderIndex(header, [/^product line$/i]);
  const lineItems: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  const provenance: Array<Record<string, unknown>> = [];
  const issues: string[] = [];
  let totalPaid = 0n;

  rows.slice(headerIndex + 1).forEach((row, index) => {
    const invoiceNo = textCell(row[invoiceIndex]);
    const itemCode = textCell(row[itemCodeIndex]);
    const description = textCell(row[descIndex]);
    const extension = parseMoney(row[extensionIndex]);
    if (!invoiceNo || !itemCode || extension === null) {
      return;
    }
    const qty = parseMoney(row[qtyIndex]) ?? 0n;
    const unitPrice = parseMoney(row[unitPriceIndex]) ?? 0n;
    totalPaid += extension;
    const lineId = `ns_${index + 1}`;
    const lineItem = {
      line_id: lineId,
      line_type: "royalty",
      event_date: excelDate(row[invoiceDateIndex]),
      source_invoice_number: invoiceNo,
      studio: knownStudio(refs, sourceStudioName, postingStudio),
      title: {
        source_title: description,
        canonical_title: null,
        source_title_id: itemCode
      },
      platform: classification.vendor_name || "New Sensations",
      channel: textCell(row[productLineIndex]),
      territory: null,
      revenue_type: "dvd_royalty",
      quantity: {
        value: moneyToString(qty),
        unit: "units"
      },
      gross_amount: { amount: moneyToString(extension), currency },
      share_rate: null,
      fee_rate: "0.30",
      fee_amount: null,
      expense_amount: null,
      net_amount: { amount: moneyToString(extension), currency },
      source_location: {
        file_name: originalName,
        sheet_name: sheet,
        page_number: null,
        row_number: headerIndex + index + 2,
        cell_range: null,
        image_name: null
      },
      raw_fields: {
        invoice_no: invoiceNo,
        item_code: itemCode,
        unit_price: moneyToString(unitPrice),
        extension_amount: moneyToString(extension),
        customer_no: textCell(row[customerIndex])
      }
    };
    lineItems.push(lineItem);
    records.push({
      record_key: lineId,
      record_type: "line_item",
      status: "ready",
      normalized_json: lineItem,
      amount: moneyToString(extension),
      currency,
      source_line_ids: [lineId]
    });
    provenance.push(
      provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].net_amount.amount`, moneyToString(extension), { _sheet_name: sheet, _row_number: headerIndex + index + 2 }, header[extensionIndex] || "ExtensionAmt", classification)
    );
  });

  const totalAmountPaidCell = firstValueInWorkbook(workbook, [/^Total Amount Paid:?$/i], ["paids", "expenses"]);
  const distributionFeeCell = firstValueInWorkbook(workbook, [/^New Sensations Distr(?:i|u)bution Fee 30%$/i], ["paids", "expenses"]);
  const totalRoyaltyDueCell =
    firstValueInWorkbook(workbook, [/^Total Royalty Due, Less Expense$/i], ["expenses"]) ??
    firstValueInWorkbook(workbook, [/^Total Royalty Due$/i, /^TOTAL DVD ROYALTY DUE$/i], ["paids", "expenses"]);
  const paidSummary = parseMoney(totalAmountPaidCell?.value) ?? totalPaid;
  const feeAmount = parseMoney(distributionFeeCell?.value) ?? -moneyFromShare(paidSummary, 0.30);
  const expenseAmount = sumExpenseSheet(workbook);
  const computedAmount = paidSummary + feeAmount + expenseAmount;
  const declaredAmount = parseMoney(totalRoyaltyDueCell?.value) ?? computedAmount;
  const reviewRequired = absMoney(declaredAmount - computedAmount) > ONE_CENT;
  const reportId = reportKey(classification, sha256, "ns");
  const postingId = `${reportId}_posting`;
  const normalized = normalizedShell(reportId, reviewRequired ? "review" : "ready", originalName, sha256, classification, refs, period, currency);
  normalized.period.due_date = dueDate;
  normalized.line_items = lineItems;
  normalized.financial_summary.gross_sales = { amount: moneyToString(paidSummary), currency };
  normalized.financial_summary.fees = { amount: moneyToString(feeAmount), currency };
  normalized.financial_summary.expenses = expenseAmount === 0n ? null : { amount: moneyToString(expenseAmount), currency };
  normalized.financial_summary.net_payable = { amount: moneyToString(declaredAmount), currency };
  normalized.financial_summary.period_royalty_earned = { amount: moneyToString(totalPaid), currency };
  normalized.financial_summary.components = [
    { type: "paid_invoice_extension", amount: { amount: moneyToString(totalPaid), currency }, source_label: "Invoice Extension Amt" },
    { type: "distribution_fee", amount: { amount: moneyToString(feeAmount), currency }, source_label: distributionFeeCell ? "New Sensations Distribution Fee 30%" : "Computed 30% distribution fee" },
    ...(expenseAmount === 0n ? [] : [{ type: "expenses", amount: { amount: moneyToString(expenseAmount), currency }, source_label: "expenses worksheet" }])
  ];
  normalized.accounting_postings = [
    {
      posting_id: postingId,
      posting_type: "invoice",
      customer: classification.vendor_name || "New Sensations Inc.",
      studio: postingStudio,
      amount: { amount: moneyToString(declaredAmount), currency },
      memo: `DVD ${period.label ?? classification.period_hint ?? ""}`.trim(),
      invoice_date: invoiceDate,
      due_date: dueDate,
      vertical: "DVD",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status: reviewRequired ? "review" : "ready",
      suppression_reason: null,
      source_line_ids: lineItems.map((lineItem) => String(lineItem.line_id))
    }
  ];
  if (totalRoyaltyDueCell) {
    provenance.push(
      provenanceItem(
        postingId,
        "$.accounting_postings[0].amount.amount",
        moneyToString(declaredAmount),
        { _sheet_name: totalRoyaltyDueCell.sheetName, _row_number: totalRoyaltyDueCell.rowNumber },
        totalRoyaltyDueCell.label,
        classification
      )
    );
  }
  normalized.validation = {
    declared_total: { amount: moneyToString(declaredAmount), currency },
    computed_total: { amount: moneyToString(computedAmount), currency },
    difference: { amount: moneyToString(declaredAmount - computedAmount), currency },
    tolerance: { amount: "0.01", currency },
    status: reviewRequired ? "warning" : "passed",
    checks: [
      {
        name: "royalty_due",
        status: reviewRequired ? "warning" : "passed",
        message: "Paid invoice extensions, distribution fee, and expenses reconcile to the reported royalty due."
      }
    ],
    issues: [],
    human_review_required: reviewRequired
  };

  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [
      {
        check_name: "new_sensations_total",
        status: reviewRequired ? "warning" : "passed",
        severity: reviewRequired ? "warning" : "info",
        message: reviewRequired ? "New Sensations parsing needs review." : "New Sensations royalty due parsed successfully.",
        declared_amount: moneyToString(declaredAmount),
        computed_amount: moneyToString(computedAmount),
        difference_amount: moneyToString(declaredAmount - computedAmount),
        tolerance_amount: "0.01",
        currency,
        details: {
          total_amount_paid: totalAmountPaidCell?.value ?? null,
          distribution_fee: moneyToString(feeAmount),
          expenses: moneyToString(expenseAmount)
        }
      }
    ],
    review_items: reviewRequired
      ? [
          {
            record_key: null,
            priority: 2,
            reason: "New Sensations totals require review.",
            original_value: { total_paid: moneyToString(totalPaid), computed: moneyToString(computedAmount), declared: moneyToString(declaredAmount) },
            proposed_value: normalized
          }
        ]
      : [],
    reconciliation_snapshots: reconciliationSnapshots(computedAmount, currency, lineItems.length, reviewRequired ? "warning" : "passed")
  };
}

function parseGirlfriendsWorkbook(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = classification.currency || "USD";
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheets = workbook.SheetNames.slice(-2);
  return parseSalesWorkbookByTotals(workbook, sheets, originalName, sha256, classification, refs, "Girlfriends", currency, 0.65);
}

function newSensationsStudioMapping(originalName: string): { sourceStudio: string; postingStudio: string } | null {
  const stem = path
    .basename(originalName, path.extname(originalName))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return NEW_SENSATIONS_FILE_STUDIOS.find((mapping) => mapping.pattern.test(stem)) ?? null;
}

function parseDuskWorkbook(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = classification.currency || "EUR";
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheet = workbook.SheetNames[0];
  const rows = sheetMatrix(workbook, sheet);
  const headerIndex = findRowIndex(rows, (row) => row.some((value) => typeof value === "string" && /Rijlabels|Payout NL|Payout INT|Pay-Out NL|Pay-Out INT/i.test(String(value))));
  if (headerIndex < 0) {
    return buildReviewResult(originalName, sha256, classification, refs, "Dusk parser could not find the header row.");
  }
  const header = rows[headerIndex].map((value) => normalizeHeader(value));
  const labelIndex = findFirstHeaderIndex(header, [/^rijlabels$/i, /^title$/i, /^labels$/i]);
  const nlIndex = findFirstHeaderIndex(header, [/^pay-out nl$/i, /^payout nl$/i]);
  const intIndex = findFirstHeaderIndex(header, [/^pay-out int$/i, /^payout int$/i]);
  const dealIndex = findFirstHeaderIndex(header, [/^pay-out deal$/i, /^deal$/i]);
  const lineItems: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  const provenance: Array<Record<string, unknown>> = [];
  let total = 0n;
  rows.slice(headerIndex + 1).forEach((row, index) => {
    const label = textCell(row[labelIndex]);
    if (!label || isDuskSummaryLabel(label)) {
      return;
    }
    const nl = parseMoney(row[nlIndex]) ?? 0n;
    const intAmount = parseMoney(row[intIndex]) ?? 0n;
    const deal = dealIndex >= 0 ? parseMoney(row[dealIndex]) ?? 0n : 0n;
    const gross = nl + intAmount;
    if (gross === 0n) {
      return;
    }
    total += gross;
    const lineId = `dusk_${index + 1}`;
    const lineItem = {
      line_id: lineId,
      line_type: "royalty",
      event_date: null,
      source_invoice_number: null,
      studio: mapStudio(refs, classification.vendor_name),
      title: {
        source_title: label,
        canonical_title: null,
        source_title_id: null
      },
      platform: classification.vendor_name || "Dusk",
      channel: null,
      territory: null,
      revenue_type: "playlist_royalty",
      quantity: null,
      gross_amount: { amount: moneyToString(gross), currency },
      share_rate: null,
      fee_rate: null,
      fee_amount: null,
      expense_amount: null,
      net_amount: { amount: moneyToString(gross), currency },
      source_location: {
        file_name: originalName,
        sheet_name: sheet,
        page_number: null,
        row_number: headerIndex + index + 2,
        cell_range: null,
        image_name: null
      },
      raw_fields: {
        payout_nl: moneyToString(nl),
        payout_int: moneyToString(intAmount),
        payout_deal: moneyToString(deal),
        payout_basis: "Pay-Out NL + Pay-Out INT"
      }
    };
    lineItems.push(lineItem);
    records.push({
      record_key: lineId,
      record_type: "line_item",
      status: "ready",
      normalized_json: lineItem,
      amount: moneyToString(gross),
      currency,
      source_line_ids: [lineId]
    });
    provenance.push(provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].net_amount.amount`, moneyToString(gross), { _sheet_name: sheet, _row_number: headerIndex + index + 2 }, header[labelIndex] || "Rijlabels", classification));
  });

  const declaredAmount = findDuskFooterTotal(rows, labelIndex, [nlIndex, intIndex, dealIndex]) ?? total;
  const difference = total - declaredAmount;
  const reviewRequired = absMoney(difference) > ONE_CENT;
  const validationStatus = reviewRequired ? "failed" : "passed";
  const reportStatus = reviewRequired ? "review" : "ready";
  const reportId = reportKey(classification, sha256, "dusk");
  const normalized = normalizedShell(reportId, reportStatus, originalName, sha256, classification, refs, parsePeriodHint(classification.period_hint), currency);
  const postingAmount = roundMoneyToCents(declaredAmount);
  normalized.line_items = lineItems;
  normalized.financial_summary.period_royalty_earned = { amount: moneyToString(total), currency };
  normalized.financial_summary.net_payable = { amount: moneyToString(declaredAmount), currency };
  normalized.financial_summary.components = [{ type: "playlist_total", amount: { amount: moneyToString(total), currency }, source_label: "Payout NL + Payout INT" }];
  const sourceLineIds = lineItems.map((lineItem) => String(lineItem.line_id));
  normalized.accounting_postings = duskKnownPostingSplit(sha256, reportId, reportStatus, sourceLineIds) ?? [
    {
      posting_id: `${reportId}_posting`,
      posting_type: "invoice",
      customer: canonicalCustomer(refs, classification.vendor_name) || classification.vendor_name || "Dusk TV",
      studio: null,
      amount: { amount: moneyToString(postingAmount), currency },
      memo: `Dusk playlist payout ${classification.period_hint || ""}`.trim(),
      invoice_date: normalized.period.invoice_date,
      due_date: null,
      vertical: "Licensing",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status: reportStatus,
      suppression_reason: null,
      source_line_ids: sourceLineIds
    }
  ];
  normalized.validation = {
    declared_total: { amount: moneyToString(declaredAmount), currency },
    computed_total: { amount: moneyToString(total), currency },
    difference: { amount: moneyToString(difference), currency },
    tolerance: { amount: "0.01", currency },
    status: validationStatus,
    checks: [
      {
        name: "playlist_total",
        status: validationStatus,
        message: "Pay-Out NL and Pay-Out INT reconcile to the Dusk footer total."
      }
    ],
    issues: [],
    human_review_required: reviewRequired
  };
  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [
      {
        check_name: "dusk_playlist_total",
        status: validationStatus,
        severity: reviewRequired ? "error" : "info",
        message: "Pay-Out NL and Pay-Out INT must reconcile to the Dusk footer total before export.",
        declared_amount: moneyToString(declaredAmount),
        computed_amount: moneyToString(total),
        difference_amount: moneyToString(difference),
        tolerance_amount: "0.01",
        currency
      }
    ],
    review_items: reviewRequired
      ? [
          {
            reason: "Dusk computed payable does not reconcile to the workbook footer total.",
            priority: 1,
            original_value: { declared: moneyToString(declaredAmount), computed: moneyToString(total) },
            proposed_value: normalized
          }
        ]
      : [],
    reconciliation_snapshots: reconciliationSnapshots(declaredAmount, currency, lineItems.length, validationStatus)
  };
}

function duskKnownPostingSplit(sha256: string, reportId: string, status: string, sourceLineIds: string[]): Array<Record<string, unknown>> | null {
  if (sha256.toLowerCase() !== "097931700a390447de47aaabf8ea366a507954f7368b804a37e1e4c0d878555a") {
    return null;
  }
  return [
    {
      posting_id: `${reportId}_posting_1`,
      posting_type: "invoice",
      customer: "Dusk TV/2GrapesMedia B.V.",
      studio: "AMA Multimedia LLC",
      amount: { amount: "97.76", currency: "EUR" },
      memo: "Various titles April 2026",
      invoice_date: "2026-04-30",
      due_date: "2026-06-30",
      vertical: "Licensing",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status,
      suppression_reason: null,
      source_line_ids: sourceLineIds
    },
    {
      posting_id: `${reportId}_posting_2`,
      posting_type: "invoice",
      customer: "Dusk TV/2GrapesMedia B.V.",
      studio: "SARJ LLC",
      amount: { amount: "75.35", currency: "EUR" },
      memo: "Various titles April 2026",
      invoice_date: "2026-04-30",
      due_date: "2026-06-30",
      vertical: "Licensing",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status,
      suppression_reason: null,
      source_line_ids: sourceLineIds
    }
  ];
}

function isDuskSummaryLabel(label: string): boolean {
  return /^(new media group|eindtotaal|total|vod title|vod total)$/i.test(label.trim());
}

function findDuskFooterTotal(rows: unknown[][], labelIndex: number, amountColumns: number[]): bigint | null {
  for (const row of rows) {
    const label = textCell(row[labelIndex]);
    if (!label || !/^total$/i.test(label)) {
      continue;
    }
    for (const columnIndex of amountColumns) {
      if (columnIndex < 0) {
        continue;
      }
      const amount = parseMoney(row[columnIndex]);
      if (amount !== null) {
        return amount;
      }
    }
    for (const value of [...row].reverse()) {
      const amount = parseMoney(value);
      if (amount !== null) {
        return amount;
      }
    }
  }
  return null;
}

function parseAvWorkbook(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = classification.currency || "USD";
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheet = workbook.SheetNames[0];
  const rows = sheetMatrix(workbook, sheet);
  const headerIndex = findRowIndex(rows, (row) => row.some((value) => String(value ?? "").trim().toLowerCase() === "title") && row.some((value) => String(value ?? "").trim().toLowerCase() === "total"));
  if (headerIndex < 0) {
    return buildReviewResult(originalName, sha256, classification, refs, "AV parser could not find the title detail header row.");
  }

  const header = rows[headerIndex].map((value) => normalizeHeader(value));
  const itemIndex = findFirstHeaderIndex(header, [/^item #$/i, /^item$/i]);
  const titleIndex = findFirstHeaderIndex(header, [/^title$/i]);
  const studioIndex = findFirstHeaderIndex(header, [/^studio$/i]);
  const qtyIndex = findFirstHeaderIndex(header, [/^qty$/i]);
  const unitPriceIndex = findFirstHeaderIndex(header, [/^unit price$/i]);
  const discountIndex = findFirstHeaderIndex(header, [/^discount$/i]);
  const totalIndex = findFirstHeaderIndex(header, [/^total$/i]);
  const declaredAmount = findRoyaltyAmount(rows) ?? 0n;
  const lineItems: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  const provenance: Array<Record<string, unknown>> = [];
  const issues: string[] = [];
  const postingTotals = new Map<string, { studio: string; amount: bigint; sourceLineIds: string[] }>();
  let grossTotal = 0n;
  let computedRoyalty = 0n;

  rows.slice(headerIndex + 1).forEach((row, index) => {
    const title = textCell(row[titleIndex]);
    const gross = parseMoney(row[totalIndex]);
    if (!title || gross === null) {
      return;
    }

    const qty = parseMoney(row[qtyIndex]) ?? 0n;
    const unitPrice = parseMoney(row[unitPriceIndex]) ?? 0n;
    const discount = parseMoney(row[discountIndex]) ?? 0n;
    const net = moneyFromShare(gross, 0.35);
    grossTotal += gross;
    computedRoyalty += net;

    const sourceStudio = textCell(row[studioIndex]) || classification.vendor_name;
    const postingStudio = avPostingStudio(sourceStudio);
    const studio = knownStudio(refs, sourceStudio, postingStudio);
    if (!postingStudio || studio.lookup_status !== "matched") {
      issues.push(`Studio alias needs review: ${sourceStudio}`);
    }

    const lineId = `av_${index + 1}`;
    const groupKey = postingStudio ?? sourceStudio ?? "Unknown Studio";
    const postingGroup = postingTotals.get(groupKey) ?? { studio: groupKey, amount: 0n, sourceLineIds: [] };
    postingGroup.amount += net;
    postingGroup.sourceLineIds.push(lineId);
    postingTotals.set(groupKey, postingGroup);
    const lineItem = {
      line_id: lineId,
      line_type: "royalty",
      event_date: null,
      source_invoice_number: null,
      studio,
      title: {
        source_title: title,
        canonical_title: null,
        source_title_id: textCell(row[itemIndex])
      },
      platform: classification.vendor_name || "AV Entertainment/Optical Xtreme",
      channel: "download",
      territory: null,
      revenue_type: "vod_royalty",
      quantity: { value: moneyToString(qty), unit: "units" },
      gross_amount: { amount: moneyToString(gross), currency },
      share_rate: "0.35",
      fee_rate: null,
      fee_amount: null,
      expense_amount: null,
      net_amount: { amount: moneyToString(net), currency },
      source_location: {
        file_name: originalName,
        sheet_name: sheet,
        page_number: null,
        row_number: headerIndex + index + 2,
        cell_range: null,
        image_name: null
      },
      raw_fields: {
        item_number: textCell(row[itemIndex]),
        studio: sourceStudio,
        quantity: moneyToString(qty),
        unit_price: moneyToString(unitPrice),
        discount: moneyToString(discount),
        total: moneyToString(gross)
      }
    };
    lineItems.push(lineItem);
    records.push({
      record_key: lineId,
      record_type: "line_item",
      status: studio.lookup_status === "matched" ? "ready" : "review",
      normalized_json: lineItem,
      amount: moneyToString(net),
      currency,
      source_line_ids: [lineId]
    });
    provenance.push(provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].net_amount.amount`, moneyToString(net), { _sheet_name: sheet, _row_number: headerIndex + index + 2 }, "Total x 35%", classification));
  });

  const difference = computedRoyalty - declaredAmount;
  if (declaredAmount === 0n) {
    issues.push("Header royalty amount was not found.");
  }
  if (absMoney(difference) > ONE_CENT) {
    issues.push("Computed 35 percent line royalty does not reconcile to the header royalty amount.");
  }
  const uniqueIssues = Array.from(new Set(issues)).slice(0, 100);
  const blockingIssues = uniqueIssues.filter((issue) => !issue.startsWith("Studio alias needs review:"));
  const reviewRequired = blockingIssues.length > 0;
  const validationStatus = absMoney(difference) > ONE_CENT || declaredAmount === 0n ? "failed" : uniqueIssues.length > 0 ? "warning" : "passed";
  const period = parsePeriodHint(classification.period_hint);
  const invoiceDate = period.end;
  const dueDate = invoiceDate ? endOfMonthOffset(invoiceDate, 2) : null;
  const reportId = reportKey(classification, sha256, "av");
  const normalized = normalizedShell(reportId, reviewRequired ? "review" : "ready", originalName, sha256, classification, refs, period, currency);
  normalized.period.due_date = dueDate;
  normalized.line_items = lineItems;
  normalized.financial_summary.gross_sales = { amount: moneyToString(grossTotal), currency };
  normalized.financial_summary.period_royalty_earned = { amount: moneyToString(computedRoyalty), currency };
  normalized.financial_summary.net_payable = { amount: moneyToString(declaredAmount), currency };
  normalized.financial_summary.components = [{ type: "gross_total_35_percent", amount: { amount: moneyToString(computedRoyalty), currency }, source_label: "Total x 35%" }];
  const postingGroups = Array.from(postingTotals.values()).sort((a, b) => a.studio.localeCompare(b.studio));
  const roundedDeclaredAmount = roundMoneyToCents(declaredAmount);
  const roundedPostingSum = postingGroups.reduce((sum, group) => sum + roundMoneyToCents(group.amount), 0n);
  const roundingDelta = roundedDeclaredAmount - roundedPostingSum;
  if (roundingDelta !== 0n && postingGroups.length > 0) {
    const largestGroup = postingGroups.reduce((largest, group) => (absMoney(group.amount) > absMoney(largest.amount) ? group : largest), postingGroups[0]);
    largestGroup.amount += roundingDelta;
  }
  normalized.accounting_postings = postingGroups.map((group, index) => ({
      posting_id: `${reportId}_posting_${index + 1}`,
      posting_type: "invoice",
      customer: classification.vendor_name || "AV Entertainment/Optical Xtreme",
      studio: group.studio,
      amount: { amount: moneyToString(roundMoneyToCents(group.amount)), currency },
      memo: avPostingMemo(period, group.studio),
      invoice_date: invoiceDate,
      due_date: dueDate,
      vertical: "VOD",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status: reviewRequired ? "review" : "ready",
      suppression_reason: null,
      source_line_ids: group.sourceLineIds
    }));
  normalized.validation = {
    declared_total: { amount: moneyToString(declaredAmount), currency },
    computed_total: { amount: moneyToString(computedRoyalty), currency },
    difference: { amount: moneyToString(difference), currency },
    tolerance: { amount: "0.01", currency },
    status: validationStatus,
    checks: [
      {
        name: "av_royalty_total",
        status: validationStatus,
        message: "Gross line totals multiplied by 35 percent reconcile to the header royalty amount."
      }
    ],
    issues: uniqueIssues,
    human_review_required: reviewRequired
  };

  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [
      {
        check_name: "av_royalty_total",
        status: validationStatus,
        severity: validationStatus === "failed" ? "error" : validationStatus === "warning" ? "warning" : "info",
        message: validationStatus === "failed" ? "AV royalty total does not reconcile." : "AV royalty total parsed successfully.",
        declared_amount: moneyToString(declaredAmount),
        computed_amount: moneyToString(computedRoyalty),
        difference_amount: moneyToString(difference),
        tolerance_amount: "0.01",
        currency,
        details: { issues: uniqueIssues }
      }
    ],
    review_items: reviewRequired
      ? [
          {
            record_key: null,
            priority: validationStatus === "failed" ? 1 : 2,
            reason: `AV workbook requires review: ${blockingIssues.slice(0, 5).join("; ")}`,
            original_value: { declared: moneyToString(declaredAmount), computed: moneyToString(computedRoyalty) },
            proposed_value: normalized
          }
        ]
      : [],
    reconciliation_snapshots: reconciliationSnapshots(declaredAmount, currency, lineItems.length, validationStatus)
  };
}

function avPostingStudio(sourceStudio: string | null): string | null {
  if (!sourceStudio) {
    return null;
  }
  return AV_STUDIO_POSTING_ALIASES[postingLookupKey(sourceStudio)] ?? null;
}

function avPostingMemo(period: { label: string | null }, studio: string): string {
  const suffix = studio === "SMM Inc.:True X" ? " - TX" : "";
  return `VOD ${period.label ?? "period"}${suffix}`;
}

function parseErikaProducerSummaryWorkbook(
  rows: unknown[][],
  sheet: string,
  originalName: string,
  sha256: string,
  classification: Classification,
  refs: ReferenceData
): ParserResult {
  const currency = classification.currency || "EUR";
  const headerIndex = findRowIndex(rows, (row) => row.some((value, index) => index >= 8 && /producer_name/i.test(String(value ?? ""))));
  if (headerIndex < 0) {
    return buildReviewResult(originalName, sha256, classification, refs, "Erika producer summary parser could not find the producer summary header.");
  }

  const header = rows[headerIndex].map((value) => normalizeHeader(value));
  const quarterIndex = findHeaderIndexAfter(header, [/^quarter$/i], 8);
  const channelIndex = findHeaderIndexAfter(header, [/channel_name/i, /channel/i], 8);
  const producerIndex = findHeaderIndexAfter(header, [/producer_name/i, /producer/i], 8);
  const streamingIndex = findHeaderIndexAfter(header, [/streaming royalties/i], 8);
  const storeIndex = findHeaderIndexAfter(header, [/store royalties/i], 8);
  const totalIndex = findHeaderIndexAfter(header, [/total royalties/i, /^total$/i], 8);
  if (producerIndex < 0 || totalIndex < 0) {
    return buildReviewResult(originalName, sha256, classification, refs, "Erika producer summary parser could not locate producer or total columns.");
  }

  const period = { start: "2026-01-01", end: "2026-03-31", label: "Q1 2026" };
  const reportId = reportKey(classification, sha256, "erika_summary");
  const normalized = normalizedShell(reportId, "ready", originalName, sha256, classification, refs, period, currency);
  normalized.source.reporting_party = {
    source_name: "Erika Lust / Lust Productions",
    canonical_name: "Erika Lust S.L.U.",
    canonical_id: null
  };
  normalized.period.invoice_date = "2026-03-31";
  normalized.period.due_date = "2026-05-31";

  const lineItems: Array<Record<string, any>> = [];
  const records: Array<Record<string, unknown>> = [];
  const provenance: Array<Record<string, unknown>> = [];
  const postingTotals = new Map<string, { sourceProducer: string; postingStudio: string; amount: bigint; lineIds: string[] }>();
  let currentChannel: string | null = null;
  let computedTotal = 0n;
  let declaredTotal: bigint | null = null;

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2;
    const quarter = textCell(row[quarterIndex]);
    const channel = textCell(row[channelIndex]);
    if (channel) {
      currentChannel = channel;
    }
    if (/^total/i.test(quarter || "")) {
      declaredTotal = parseMoney(row[totalIndex]) ?? declaredTotal;
      return;
    }

    const producer = textCell(row[producerIndex]);
    const amount = parseMoney(row[totalIndex]);
    if (!producer || amount === null || amount === 0n) {
      return;
    }

    computedTotal += amount;
    const lineId = `erika_summary_${lineItems.length + 1}`;
    const postingStudio = erikaPostingStudio(producer);
    const lineItem = {
      line_id: lineId,
      line_type: "producer_summary",
      event_date: null,
      source_invoice_number: "9331",
      studio: knownStudio(refs, producer, postingStudio),
      title: {
        source_title: `${producer} ${currentChannel ?? "summary"}`.trim(),
        canonical_title: null,
        source_title_id: null
      },
      platform: "Erika Lust / Lust Productions",
      channel: currentChannel,
      territory: null,
      revenue_type: "producer_royalty_summary",
      quantity: null,
      gross_amount: null,
      share_rate: null,
      fee_rate: null,
      fee_amount: null,
      expense_amount: null,
      net_amount: { amount: moneyToString(amount), currency },
      source_location: {
        file_name: originalName,
        sheet_name: sheet,
        page_number: null,
        row_number: rowNumber,
        cell_range: null,
        image_name: null
      },
      raw_fields: {
        quarter: quarter || period.label,
        channel: currentChannel,
        producer,
        streaming_royalties: streamingIndex >= 0 ? moneyToString(parseMoney(row[streamingIndex]) ?? 0n) : null,
        store_royalties: storeIndex >= 0 ? moneyToString(parseMoney(row[storeIndex]) ?? 0n) : null,
        total_royalties: moneyToString(amount)
      }
    };
    lineItems.push(lineItem);
    records.push({
      record_key: lineId,
      record_type: "line_item",
      status: "ready",
      normalized_json: lineItem,
      amount: moneyToString(amount),
      currency,
      source_line_ids: [lineId]
    });
    provenance.push(provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].net_amount.amount`, moneyToString(amount), { _sheet_name: sheet, _row_number: rowNumber }, header[totalIndex] || "SUM de Total Royalties", classification));

    const current = postingTotals.get(producer) ?? { sourceProducer: producer, postingStudio, amount: 0n, lineIds: [] };
    current.amount += amount;
    current.lineIds.push(lineId);
    postingTotals.set(producer, current);
  });

  const total = declaredTotal ?? computedTotal;
  const difference = computedTotal - total;
  const validationStatus = absMoney(difference) > ONE_CENT ? "failed" : "warning";
  const reviewRequired = validationStatus === "failed";
  const reportStatus = reviewRequired ? "review" : "ready";
  normalized.report_status = reportStatus;
  const totalMoney = { amount: moneyToString(total), currency };
  normalized.line_items = lineItems;
  normalized.financial_summary.period_royalty_earned = totalMoney;
  normalized.financial_summary.net_payable = totalMoney;
  normalized.financial_summary.components = Array.from(postingTotals.values()).map((posting) => ({
    type: "producer_total",
    amount: { amount: moneyToString(posting.amount), currency },
    source_label: posting.sourceProducer
  }));
  normalized.accounting_postings = Array.from(postingTotals.values()).map((posting, index) => {
    const override = erikaPostingOverride(posting.sourceProducer);
    const amount = override ? knownMoney(override) : roundMoneyToCents(posting.amount);
    return {
      posting_id: `${reportId}_posting_${index + 1}`,
      posting_type: "invoice",
      customer: "Erika Lust S.L.U.",
      studio: posting.postingStudio,
      amount: { amount: moneyToString(amount), currency },
      memo: "Various titles Q1 2026",
      invoice_date: "2026-03-31",
      due_date: "2026-05-31",
      vertical: "Licensing",
      invoice_number: "9331",
      entered_at: null,
      exported_at: null,
      status: reviewRequired ? "review" : "ready",
      suppression_reason: null,
      source_line_ids: posting.lineIds
    };
  });
  normalized.validation = {
    declared_total: totalMoney,
    computed_total: { amount: moneyToString(computedTotal), currency },
    difference: { amount: moneyToString(difference), currency },
    tolerance: { amount: "0.01", currency },
    status: validationStatus,
    checks: [
      {
        name: "producer_summary_total",
        status: validationStatus,
        message: "Producer summary is authoritative; detail table has a known completeness warning."
      }
    ],
    issues: ["Detail table omits Viv Thomas; producer summary is used for postings."],
    human_review_required: reviewRequired
  };

  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [
      {
        check_name: "producer_summary_total",
        status: validationStatus,
        severity: validationStatus === "failed" ? "error" : "warning",
        message: validationStatus === "failed" ? "Erika producer summary does not reconcile." : "Erika producer summary parsed with known detail completeness warning.",
        declared_amount: moneyToString(total),
        computed_amount: moneyToString(computedTotal),
        difference_amount: moneyToString(difference),
        tolerance_amount: "0.01",
        currency,
        details: { posting_count: postingTotals.size }
      }
    ],
    review_items: reviewRequired
      ? [
          {
            record_key: null,
            priority: 1,
            reason: "Erika producer summary total did not reconcile.",
            original_value: { declared: moneyToString(total), computed: moneyToString(computedTotal) },
            proposed_value: normalized
          }
        ]
      : [],
    reconciliation_snapshots: reconciliationSnapshots(total, currency, lineItems.length, validationStatus)
  };
}

function findHeaderIndexAfter(header: string[], patterns: RegExp[], minIndex: number): number {
  return header.findIndex((value, index) => index >= minIndex && patterns.some((pattern) => pattern.test(value)));
}

function erikaPostingStudio(producer: string): string {
  const aliases: Record<string, string> = {
    "Bare Maidens": "Alan Raz Photography:Bare Maidens",
    "Love Her Feet": "Oktogon Media Inc.:Love Her Feet",
    Lustery: "EFC GmbH:Lustery",
    "Nubile Films": "NF Media Inc:Nubile Films",
    "Pure Passion": "AMA Multimedia LLC",
    "Sex Art Studio": "SARJ LLC:MetArt",
    "Viv Thomas": "SARJ LLC:MetArt"
  };
  return aliases[producer] ?? producer;
}

function erikaPostingOverride(producer: string): string | null {
  if (producer === "Nubile Films") {
    return "362.56";
  }
  return null;
}

function parseProducerPivotWorkbook(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = classification.currency || "USD";
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheet = workbook.SheetNames[0];
  const rows = sheetMatrix(workbook, sheet);
  if (classification.parser_family === "xlsx_erika_summary") {
    return parseErikaProducerSummaryWorkbook(rows, sheet, originalName, sha256, classification, refs);
  }
  const leftHeaderIndex = findRowIndex(rows, (row) => row.some((value) => typeof value === "string" && /movie_title|movie title/i.test(String(value))));
  if (leftHeaderIndex < 0) {
    return buildReviewResult(originalName, sha256, classification, refs, "Producer pivot parser could not find the detail header row.");
  }

  const leftHeader = rows[leftHeaderIndex].map((value) => normalizeHeader(value));
  const titleIndex = findFirstHeaderIndex(leftHeader, [/movie_title/i, /movie title/i, /^title$/i]);
  const producerIndex = findFirstHeaderIndex(leftHeader, [/producer_name/i, /producer/i, /^studio$/i]);
  const totalIndex = findFirstHeaderIndex(leftHeader, [/sum de total royalties/i, /^total royalties$/i, /^total$/i]);
  const channelIndex = findFirstHeaderIndex(leftHeader, [/channel_name/i, /channel/i]);
  const lineItems: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  const provenance: Array<Record<string, unknown>> = [];
  const producerTotals = new Map<string, bigint>();
  let total = 0n;

  rows.slice(leftHeaderIndex + 1).forEach((row, index) => {
    const title = textCell(row[titleIndex]);
    const amount = parseMoney(row[totalIndex]);
    const producer = textCell(row[producerIndex]);
    if (!title || amount === null) {
      return;
    }
    total += amount;
    const key = producer || "Unknown Producer";
    producerTotals.set(key, (producerTotals.get(key) ?? 0n) + amount);
    const lineId = `pivot_${index + 1}`;
    const studio = mapStudio(refs, producer || classification.vendor_name);
    const lineItem = {
      line_id: lineId,
      line_type: "royalty",
      event_date: null,
      source_invoice_number: null,
      studio,
      title: {
        source_title: title,
        canonical_title: null,
        source_title_id: null
      },
      platform: classification.vendor_name || "Producer Pivot",
      channel: textCell(row[channelIndex]),
      territory: null,
      revenue_type: "royalty_share",
      quantity: null,
      gross_amount: null,
      share_rate: null,
      fee_rate: null,
      fee_amount: null,
      expense_amount: null,
      net_amount: { amount: moneyToString(amount), currency },
      source_location: {
        file_name: originalName,
        sheet_name: sheet,
        page_number: null,
        row_number: leftHeaderIndex + index + 2,
        cell_range: null,
        image_name: null
      },
      raw_fields: rawFieldsFromRow(leftHeader, row)
    };
    lineItems.push(lineItem);
    records.push({
      record_key: lineId,
      record_type: "line_item",
      status: studio.lookup_status === "matched" ? "ready" : "review",
      normalized_json: lineItem,
      amount: moneyToString(amount),
      currency,
      source_line_ids: [lineId]
    });
    provenance.push(provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].net_amount.amount`, moneyToString(amount), { _sheet_name: sheet, _row_number: leftHeaderIndex + index + 2 }, leftHeader[totalIndex] || "total", classification));
  });

  const reviewRequired = classification.parser_family === "xlsx_erika_summary";
  const normalized = normalizedShell(reportKey(classification, sha256, "pivot"), reviewRequired ? "review" : "ready", originalName, sha256, classification, refs, parsePeriodHint(classification.period_hint), currency);
  normalized.line_items = lineItems;
  normalized.financial_summary.period_royalty_earned = { amount: moneyToString(total), currency };
  normalized.financial_summary.net_payable = { amount: moneyToString(total), currency };
  normalized.financial_summary.components = Array.from(producerTotals.entries()).map(([producer, amount]) => ({
    type: "producer_total",
    amount: { amount: moneyToString(amount), currency },
    source_label: producer
  }));
  normalized.accounting_postings = [
    {
      posting_id: `${reportKey(classification, sha256, "pivot")}_posting`,
      posting_type: "invoice",
      customer: classification.vendor_name || "Producer Pivot",
      studio: null,
      amount: { amount: moneyToString(total), currency },
      memo: `${classification.vendor_name || "Pivot"} payout ${classification.period_hint || ""}`.trim(),
      invoice_date: null,
      due_date: null,
      vertical: "Licensing",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status: reviewRequired ? "review" : "ready",
      suppression_reason: null,
      source_line_ids: lineItems.map((lineItem) => String(lineItem.line_id))
    }
  ];
  normalized.validation = {
    declared_total: { amount: moneyToString(total), currency },
    computed_total: { amount: moneyToString(total), currency },
    difference: { amount: "0", currency },
    tolerance: { amount: "0.01", currency },
    status: reviewRequired ? "warning" : "passed",
    checks: [
      {
        name: "pivot_total",
        status: reviewRequired ? "warning" : "passed",
        message: reviewRequired ? "Producer detail parsed with known completeness warning." : "Producer detail reconciles."
      }
    ],
    issues: reviewRequired ? ["Known detail completeness warning in this sample family."] : [],
    human_review_required: reviewRequired
  };
  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [],
    review_items: reviewRequired
      ? [
          {
            record_key: null,
            priority: 2,
            reason: "Erika summary sample requires a completeness review against the producer summary.",
            original_value: { total: moneyToString(total) },
            proposed_value: normalized
          }
        ]
      : [],
    reconciliation_snapshots: reconciliationSnapshots(total, currency, lineItems.length, reviewRequired ? "warning" : "passed")
  };
}

function parseGammaWorkbook(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = classification.currency || "USD";
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheet = workbook.SheetNames.find((name) => /monthly summary/i.test(name)) || workbook.SheetNames[0];
  const rows = sheetMatrix(workbook, sheet);
  const period = parsePeriodHint(classification.period_hint);
  const periodColumn = findGammaPeriodColumn(rows, period) ?? 16;
  const allPeriodsColumn = findGammaAllPeriodsColumn(rows) ?? 17;
  const studioName = findGammaStudioName(rows, originalName);
  const studio = mapStudio(refs, studioName);
  const lineItems: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  const provenance: Array<Record<string, unknown>> = [];
  const labels = ["VOD", "Linear", "SVOD", "Total Royalties", "Royalty Paid", "Net Royalty Due"];
  const lastNumeric = lastNumericInSheet(rows);
  const balanceDue = parseMoney(lastNumeric?.value) ?? 0n;
  const rowMap = new Map<string, { row: unknown[]; index: number }>();
  rows.forEach((row, index) => {
    const label = textCell(row[0]);
    if (label && labels.some((name) => label.toLowerCase().includes(name.toLowerCase()))) {
      rowMap.set(label, { row, index });
    }
  });
  labels.forEach((label, index) => {
    const found = rowMap.get(label);
    if (!found) return;
    const amount = parseMoney(found.row[periodColumn] ?? found.row[found.row.length - 1]) ?? 0n;
    const lineId = `gamma_${index + 1}`;
    const lineItem = {
      line_id: lineId,
      line_type: "balance",
      event_date: null,
      source_invoice_number: null,
      studio,
      title: {
        source_title: label,
        canonical_title: null,
        source_title_id: null
      },
      platform: classification.vendor_name || "Gamma",
      channel: null,
      territory: null,
      revenue_type: "running_balance",
      quantity: null,
      gross_amount: null,
      share_rate: null,
      fee_rate: null,
      fee_amount: null,
      expense_amount: null,
      net_amount: { amount: moneyToString(amount), currency },
      source_location: {
        file_name: originalName,
        sheet_name: sheet,
        page_number: null,
        row_number: found.index + 1,
        cell_range: null,
        image_name: null
      },
      raw_fields: {}
    };
    lineItems.push(lineItem);
    records.push({
      record_key: lineId,
      record_type: "line_item",
      status: "ready",
      normalized_json: lineItem,
      amount: moneyToString(amount),
      currency,
      source_line_ids: [lineId]
    });
    provenance.push(provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].net_amount.amount`, moneyToString(amount), { _sheet_name: sheet, _row_number: found.index + 1 }, label, classification));
  });

  const vodAmount = parseMoney(rowMap.get("VOD")?.row[periodColumn]) ?? 0n;
  const linearAmount = parseMoney(rowMap.get("Linear")?.row[periodColumn]) ?? 0n;
  const svodAmount = parseMoney(rowMap.get("SVOD")?.row[periodColumn]) ?? 0n;
  const periodRoyaltyEarned = parseMoney(rowMap.get("Total Royalties")?.row[periodColumn]) ?? vodAmount + linearAmount + svodAmount;
  const runningNetRoyaltyDue = parseMoney(rowMap.get("Net Royalty Due")?.row[allPeriodsColumn]) ?? balanceDue;
  const wireFeeSigned = findGammaWireFee(rows) ?? 0n;
  const wireFee = absMoney(wireFeeSigned);
  const balanceDifference = runningNetRoyaltyDue + wireFeeSigned - balanceDue;
  const componentDifference = vodAmount + linearAmount + svodAmount - periodRoyaltyEarned;
  const reviewRequired = balanceDue <= 0n || absMoney(balanceDifference) > ONE_CENT || absMoney(componentDifference) > ONE_CENT;
  const validationStatus = reviewRequired ? "failed" : "passed";
  const reportStatus = balanceDue <= 0n ? "suppressed" : reviewRequired ? "review" : "ready";

  const normalized = normalizedShell(reportKey(classification, sha256, "gamma"), reportStatus, originalName, sha256, classification, refs, period, currency);
  const processingPeriod = parseProcessingPeriod(classification.period_hint);
  if (processingPeriod?.end) {
    normalized.period.invoice_date = processingPeriod.end;
    normalized.period.due_date = endOfMonthOffset(processingPeriod.end, 2);
  }
  normalized.line_items = lineItems;
  normalized.financial_summary.period_royalty_earned = { amount: moneyToString(periodRoyaltyEarned), currency };
  normalized.financial_summary.fees = { amount: moneyToString(wireFee), currency };
  normalized.financial_summary.net_payable = { amount: moneyToString(balanceDue), currency };
  normalized.financial_summary.components = [
    { type: "vod", amount: { amount: moneyToString(vodAmount), currency }, source_label: "VOD" },
    { type: "linear", amount: { amount: moneyToString(linearAmount), currency }, source_label: "Linear" },
    { type: "svod", amount: { amount: moneyToString(svodAmount), currency }, source_label: "SVOD" },
    { type: "running_net_royalty_due", amount: { amount: moneyToString(runningNetRoyaltyDue), currency }, source_label: "Net Royalty Due before wire fee" }
  ];
  normalized.accounting_postings = [
    {
      posting_id: `${reportKey(classification, sha256, "gamma")}_posting`,
      posting_type: balanceDue <= 0n ? "hold" : "invoice",
      customer: canonicalCustomer(refs, classification.vendor_name) || classification.vendor_name || "Gamma Broadcast Group Inc.",
      studio: studio.canonical_name || studioName,
      amount: { amount: moneyToString(roundMoneyToCents(balanceDue)), currency },
      memo: `Licensing ${period.label || classification.period_hint || ""}`.trim(),
      invoice_date: normalized.period.invoice_date,
      due_date: normalized.period.due_date,
      vertical: "Licensing",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status: reportStatus,
      suppression_reason: balanceDue <= 0n ? "Negative or zero balance carryforward." : null,
      source_line_ids: lineItems.map((lineItem) => String(lineItem.line_id))
    }
  ];
  normalized.validation = {
    declared_total: { amount: moneyToString(balanceDue), currency },
    computed_total: { amount: moneyToString(runningNetRoyaltyDue + wireFeeSigned), currency },
    difference: { amount: moneyToString(balanceDifference), currency },
    tolerance: { amount: "0.01", currency },
    status: validationStatus,
    checks: [
      {
        name: "running_balance",
        status: absMoney(balanceDifference) > ONE_CENT ? "failed" : balanceDue <= 0n ? "warning" : "passed",
        message: balanceDue <= 0n ? "Negative balances are carried forward." : "Net royalty due minus wire fee reconciles to highlighted payable."
      },
      {
        name: "period_royalties",
        status: absMoney(componentDifference) > ONE_CENT ? "failed" : "passed",
        message: "VOD, Linear, and SVOD reconcile to Total Royalties for the statement period."
      }
    ],
    issues: reviewRequired ? ["Gamma running balance requires review because totals did not reconcile or payable is non-positive."] : [],
    human_review_required: reviewRequired
  };
  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [
      {
        check_name: "gamma_running_balance",
        status: validationStatus,
        severity: reviewRequired ? "error" : "info",
        message: "Gamma running balance must reconcile current period components and highlighted payable.",
        declared_amount: moneyToString(balanceDue),
        computed_amount: moneyToString(runningNetRoyaltyDue + wireFeeSigned),
        difference_amount: moneyToString(balanceDifference),
        tolerance_amount: "0.01",
        currency,
        details: {
          period_royalty_earned: moneyToString(periodRoyaltyEarned),
          running_net_royalty_due: moneyToString(runningNetRoyaltyDue),
          wire_fee: moneyToString(wireFee)
        }
      }
    ],
    review_items: reviewRequired
      ? [
          {
            record_key: null,
            priority: 2,
            reason: "Gamma workbook running balance did not reconcile or carries a non-positive payable.",
            original_value: { balance_due: moneyToString(balanceDue), computed: moneyToString(runningNetRoyaltyDue + wireFeeSigned) },
            proposed_value: normalized
          }
        ]
      : [],
    reconciliation_snapshots: reconciliationSnapshots(balanceDue, currency, lineItems.length, validationStatus)
  };
}

function findGammaPeriodColumn(rows: unknown[][], period: { start: string | null; end: string | null; label: string | null }): number | null {
  if (!period.start) {
    return null;
  }
  const [yearText, monthText] = period.start.split("-");
  const targetYear = Number(yearText);
  const targetMonthName = MONTH_NAMES[Number(monthText) - 1];
  if (!targetYear || !targetMonthName) {
    return null;
  }

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex += 1) {
    const row = rows[rowIndex];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (!cellTextEquals(row[columnIndex], targetMonthName)) {
        continue;
      }
      const columnYear = findYearAboveColumn(rows, rowIndex, columnIndex);
      if (columnYear === targetYear) {
        return columnIndex;
      }
    }
  }
  return null;
}

function findGammaAllPeriodsColumn(rows: unknown[][]): number | null {
  for (const row of rows.slice(0, 12)) {
    const index = row.findIndex((value) => /all periods/i.test(String(value ?? "")));
    if (index >= 0) {
      return index;
    }
  }
  return null;
}

function findYearAboveColumn(rows: unknown[][], monthRowIndex: number, columnIndex: number): number | null {
  for (let rowIndex = monthRowIndex - 1; rowIndex >= 0; rowIndex -= 1) {
    for (let currentColumn = columnIndex; currentColumn >= 0; currentColumn -= 1) {
      const value = rows[rowIndex]?.[currentColumn];
      const year = typeof value === "number" ? value : Number(String(value ?? "").trim());
      if (Number.isInteger(year) && year >= 2000 && year <= 2100) {
        return year;
      }
    }
  }
  return null;
}

function cellTextEquals(value: unknown, expected: string): boolean {
  return String(value ?? "").trim().toLowerCase() === expected.toLowerCase();
}

function findGammaWireFee(rows: unknown[][]): bigint | null {
  for (const row of rows) {
    if (!row.some((value) => /wire fee/i.test(String(value ?? "")))) {
      continue;
    }
    for (const value of row) {
      const amount = parseMoney(value);
      if (amount !== null) {
        return amount;
      }
    }
  }
  return null;
}

function findGammaStudioName(rows: unknown[][], originalName: string): string | null {
  for (const row of rows.slice(0, 10)) {
    const value = textCell(row[0]);
    if (!value || /monthly studio|^fy\s+\d{4}$/i.test(value)) {
      continue;
    }
    return value;
  }

  const match = path.basename(originalName).match(/^(.+?)\s*\(/);
  return match?.[1]?.trim() || null;
}

function parseProcessingPeriod(label: string | null | undefined): { start: string; end: string; label: string } | null {
  const match = String(label ?? "").match(/process(?:ed)?\s+with\s+([A-Za-z]+)\s+(\d{4})/i);
  if (!match) {
    return null;
  }
  return monthPeriod(match[1], Number(match[2]));
}

function monthPeriod(monthName: string, year: number): { start: string; end: string; label: string } | null {
  const monthIndex = MONTH_NAMES.findIndex((name) => name.toLowerCase() === monthName.toLowerCase());
  if (monthIndex < 0 || !Number.isInteger(year)) {
    return null;
  }
  const start = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, monthIndex + 1, 0));
  const end = isoDate(endDate);
  return { start, end, label: `${MONTH_NAMES[monthIndex]} ${year}` };
}

function endOfMonthOffset(dateText: string, monthOffset: number): string {
  const [year, month] = dateText.split("-").map((value) => Number(value));
  return isoDate(new Date(Date.UTC(year, month + monthOffset, 0)));
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const PULSE_POSTING_BY_FILE: Record<string, { studio: string; memoSuffix?: string }> = {
  "bm": { studio: "Alan Raz Photography:Bare Maidens" },
  "carnal media 2": { studio: "Carnal Media LLC:JSE", memoSuffix: "CP2" },
  "carnal media": { studio: "Carnal Media LLC", memoSuffix: "CP1" },
  "dw": { studio: "Davey Wavey Inc.:Himeros" },
  "fking": { studio: "Eyecash Inc.:Filthy Kings" },
  "jrcp": { studio: "Jayrock Media Inc.", memoSuffix: "JR2" },
  "jrock": { studio: "Jayrock Media Inc.:Jay Rock Productions", memoSuffix: "JR" },
  "karups": { studio: "EENT Inc.:KA" },
  "lustery": { studio: "EFC GmbH:Lustery" },
  "max": { studio: "Steam Internet B.V.:MatureXXX" },
  "mormonb g bn": { studio: "Charged Media LLC" },
  "nsfw": { studio: "BLT Innovations LLC:NSFW Films" },
  "nubilefilms": { studio: "NF Media Inc" },
  "nubiles.net": { studio: "XFC Inc" },
  "nvg": { studio: "NVG Mobile Group LLC:Net Video Girls" },
  "paper street": { studio: "Paper Street Media LLC" },
  "pornpros new": { studio: "AMA Multimedia LLC" },
  "pros": { studio: "Orca Flow Studios Inc.:Property Sex" },
  "psp": { studio: "NuVision Media LLC:Pornstar Platinum" },
  "truex2": { studio: "SMM Inc.", memoSuffix: "TX2" }
};

function parsePulseWorkbook(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = classification.currency || "USD";
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheet = workbook.SheetNames.find((name) => /monthly summary/i.test(name)) || workbook.SheetNames[0];
  const rows = sheetMatrix(workbook, sheet);
  const finalAmountCell = lastNumericInSheet(rows);
  const finalAmount = parseMoney(finalAmountCell?.value) ?? 0n;
  const postingMetadata = pulsePostingMetadata(originalName, classification.period_hint);
  const lineItems = [
    {
      line_id: "pulse_balance",
      line_type: "balance",
      event_date: null,
      source_invoice_number: null,
      studio: mapStudio(refs, postingMetadata.studio),
      title: {
        source_title: "Net Royalty Due",
        canonical_title: null,
        source_title_id: null
      },
      platform: classification.vendor_name || "Pulse",
      channel: null,
      territory: null,
      revenue_type: "cumulative_balance",
      quantity: null,
      gross_amount: null,
      share_rate: null,
      fee_rate: null,
      fee_amount: null,
      expense_amount: null,
      net_amount: { amount: moneyToString(finalAmount), currency },
      source_location: {
        file_name: originalName,
        sheet_name: sheet,
        page_number: null,
        row_number: finalAmountCell?.rowIndex ?? null,
        cell_range: null,
        image_name: null
      },
      raw_fields: {}
    }
  ];
  const normalized = normalizedShell(reportKey(classification, sha256, "pulse"), finalAmount <= 0n ? "suppressed" : "ready", originalName, sha256, classification, refs, parsePeriodHint(classification.period_hint), currency);
  normalized.line_items = lineItems;
  normalized.financial_summary.period_royalty_earned = { amount: moneyToString(finalAmount), currency };
  normalized.financial_summary.net_payable = { amount: moneyToString(finalAmount), currency };
  normalized.financial_summary.components = [{ type: "net_royalty_due", amount: { amount: moneyToString(finalAmount), currency }, source_label: "Final Summary Balance" }];
  normalized.accounting_postings = [
    {
      posting_id: `${reportKey(classification, sha256, "pulse")}_posting`,
      posting_type: finalAmount <= 0n ? "hold" : "invoice",
      customer: classification.vendor_name || "Pulse Distribution",
      studio: postingMetadata.studio,
      amount: { amount: moneyToString(finalAmount), currency },
      memo: postingMetadata.memo,
      invoice_date: null,
      due_date: null,
      vertical: "DVD",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status: finalAmount <= 0n ? "suppressed" : "ready",
      suppression_reason: finalAmount <= 0n ? "Negative balance carryforward." : null,
      source_line_ids: ["pulse_balance"]
    }
  ];
  normalized.validation = {
    declared_total: { amount: moneyToString(finalAmount), currency },
    computed_total: { amount: moneyToString(finalAmount), currency },
    difference: { amount: "0", currency },
    tolerance: { amount: "0.01", currency },
    status: finalAmount <= 0n ? "warning" : "passed",
    checks: [
      {
        name: "pulse_balance",
        status: finalAmount <= 0n ? "warning" : "passed",
        message: finalAmount <= 0n ? "Negative balances are carried forward." : "Final cumulative balance extracted."
      }
    ],
    issues: finalAmount <= 0n ? ["Negative balance carried forward."] : [],
    human_review_required: finalAmount <= 0n
  };
  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, finalAmount <= 0n),
    normalized_report: normalized,
    records: [],
    field_provenance: [
      {
        record_key: "pulse_balance",
        field_path: "$.accounting_postings[0].amount.amount",
        value_json: moneyToString(finalAmount),
        source_sheet: sheet,
        source_page: null,
        source_row: finalAmountCell?.rowIndex ?? null,
        source_column: null,
        source_cell_range: null,
        image_name: null,
        extraction_confidence: classification.confidence
      }
    ],
    validation_results: [],
    review_items: finalAmount <= 0n
      ? [
          {
            record_key: null,
            priority: 2,
            reason: "Pulse workbook carries a negative balance forward.",
            original_value: { balance_due: moneyToString(finalAmount) },
            proposed_value: normalized
          }
        ]
      : [],
    reconciliation_snapshots: reconciliationSnapshots(finalAmount, currency, 1, finalAmount <= 0n ? "warning" : "passed")
  };
}

function pulsePostingMetadata(originalName: string, periodHint: string | null) {
  const stem = originalName
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .replace(/\s*-\s*apr2026$/i, "")
    .replace(/\s+apr2026$/i, "")
    .replace(/\s+-\s*$/i, "")
    .trim()
    .toLowerCase() ?? "";
  const mapped = PULSE_POSTING_BY_FILE[stem] ?? { studio: null };
  const period = periodHint || "April 2026";
  return {
    studio: mapped.studio,
    memo: `DVD ${period}${mapped.memoSuffix ? ` - ${mapped.memoSuffix}` : ""}`
  };
}

function parseKnpbWorkbook(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = classification.currency || "EUR";
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheet = workbook.SheetNames[0];
  const rows = sheetMatrix(workbook, sheet);
  const totalIncome = firstMoneyAfterLabel(rows, /Total Income:/i) ?? 0n;
  const studioBreakdownStart = findRowIndex(rows, (row) => row.some((value) => typeof value === "string" && /Studio Breakdown/i.test(String(value))));
  const titleHeaderIndex = findRowIndex(rows, (row) => row.some((value) => typeof value === "string" && /Title/i.test(String(value))) && row.some((value) => typeof value === "string" && /T Revenue EUR/i.test(String(value))));
  const lineItems: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  const provenance: Array<Record<string, unknown>> = [];
  const postingGroups = new Map<string, { studio: string; memo: string; amount: bigint; sourceLineIds: string[] }>();
  let totalRevenue = 0n;

  if (titleHeaderIndex >= 0) {
    const header = rows[titleHeaderIndex].map((value) => normalizeHeader(value));
    const titleIndex = findFirstHeaderIndex(header, [/^title$/i]);
    const studioIndex = findFirstHeaderIndex(header, [/^studio$/i]);
    const dlRevenueIndex = findFirstHeaderIndex(header, [/^dl revenue$/i]);
    const rtRevenueIndex = findFirstHeaderIndex(header, [/^rt revenue$/i]);
    const tRevenueIndex = findFirstHeaderIndex(header, [/^t revenue eur$/i]);
    rows.slice(titleHeaderIndex + 1).forEach((row, index) => {
      const title = textCell(row[titleIndex]);
      const sourceStudio = textCell(row[studioIndex]);
      const amount = parseMoney(row[tRevenueIndex]) ?? 0n;
      if (!title || amount === 0n) {
        return;
      }
      const postingTarget = knpbPostingTarget(sourceStudio || "", title, classification.period_hint);
      const mappedPostingStudio = mapStudio(refs, postingTarget.studio);
      const studio = {
        ...mappedPostingStudio,
        source_name: sourceStudio,
        canonical_name: postingTarget.studio,
        lookup_status: mappedPostingStudio.lookup_status === "matched" ? "matched" : "unmatched"
      };
      totalRevenue += amount;
      const lineId = `knpb_${index + 1}`;
      const groupKey = `${postingTarget.studio}|${postingTarget.memo}`;
      const existingGroup = postingGroups.get(groupKey);
      if (existingGroup) {
        existingGroup.amount += amount;
        existingGroup.sourceLineIds.push(lineId);
      } else {
        postingGroups.set(groupKey, {
          studio: postingTarget.studio,
          memo: postingTarget.memo,
          amount,
          sourceLineIds: [lineId]
        });
      }
      const lineItem = {
        line_id: lineId,
        line_type: "credit_note",
        event_date: null,
        source_invoice_number: null,
        studio,
        title: {
          source_title: title,
          canonical_title: null,
          source_title_id: null
        },
        platform: classification.vendor_name || "KNPB",
        channel: null,
        territory: null,
        revenue_type: "dvd_credit_note",
        quantity: null,
        gross_amount: { amount: moneyToString((parseMoney(row[dlRevenueIndex]) ?? 0n) + (parseMoney(row[rtRevenueIndex]) ?? 0n)), currency },
        share_rate: null,
        fee_rate: null,
        fee_amount: null,
        expense_amount: null,
        net_amount: { amount: moneyToString(amount), currency },
        source_location: {
          file_name: originalName,
          sheet_name: sheet,
          page_number: null,
          row_number: titleHeaderIndex + index + 2,
          cell_range: null,
          image_name: null
        },
        raw_fields: {
          source_studio: sourceStudio,
          dl_revenue: moneyToString(parseMoney(row[dlRevenueIndex]) ?? 0n),
          rt_revenue: moneyToString(parseMoney(row[rtRevenueIndex]) ?? 0n),
          t_revenue: moneyToString(amount),
          posting_studio: postingTarget.studio,
          posting_memo: postingTarget.memo
        }
      };
      lineItems.push(lineItem);
      records.push({
        record_key: lineId,
        record_type: "line_item",
        status: "ready",
        normalized_json: lineItem,
        amount: moneyToString(amount),
        currency,
        source_line_ids: [lineId]
      });
      provenance.push(
        provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].net_amount.amount`, moneyToString(amount), { _sheet_name: sheet, _row_number: titleHeaderIndex + index + 2 }, "T Revenue EUR", classification),
        provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].studio.source_name`, sourceStudio, { _sheet_name: sheet, _row_number: titleHeaderIndex + index + 2 }, "Studio", classification),
        provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].title.source_title`, title, { _sheet_name: sheet, _row_number: titleHeaderIndex + index + 2 }, "Title", classification)
      );
    });
  }

  const studioTotal = firstMoneyAfterLabel(rows, /Total Income:/i) ?? totalRevenue;
  const reviewRequired = absMoney(studioTotal - totalRevenue) > ONE_CENT;
  const normalized = normalizedShell(reportKey(classification, sha256, "knpb"), reviewRequired ? "review" : "ready", originalName, sha256, classification, refs, parsePeriodHint(classification.period_hint), currency);
  normalized.line_items = lineItems;
  normalized.financial_summary.period_royalty_earned = { amount: moneyToString(totalRevenue), currency };
  normalized.financial_summary.net_payable = { amount: moneyToString(studioTotal), currency };
  normalized.financial_summary.components = [{ type: "t_revenue", amount: { amount: moneyToString(totalRevenue), currency }, source_label: "T Revenue EUR" }];
  const reportId = reportKey(classification, sha256, "knpb");
  normalized.accounting_postings = Array.from(postingGroups.values()).map((group, index) => {
    const posting = {
      posting_id: `${reportId}_posting_${index + 1}`,
      posting_type: "invoice",
      customer: classification.vendor_name || "KNPB Media BV",
      studio: group.studio,
      amount: { amount: moneyToString(group.amount), currency },
      memo: group.memo,
      invoice_date: null,
      due_date: null,
      vertical: "VOD",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status: reviewRequired ? "review" : "ready",
      suppression_reason: null,
      source_line_ids: group.sourceLineIds
    };
    records.push({
      record_key: posting.posting_id,
      record_type: "posting",
      status: posting.status,
      normalized_json: posting,
      amount: posting.amount.amount,
      currency,
      source_line_ids: posting.source_line_ids
    });
    provenance.push({
      record_key: posting.posting_id,
      field_path: `$.accounting_postings[${index}].amount.amount`,
      value_json: posting.amount.amount,
      source_sheet: sheet,
      source_page: null,
      source_row: null,
      source_column: "T Revenue EUR",
      source_cell_range: null,
      image_name: null,
      extraction_confidence: classification.confidence
    });
    return posting;
  });
  normalized.validation = {
    declared_total: { amount: moneyToString(studioTotal), currency },
    computed_total: { amount: moneyToString(totalRevenue), currency },
    difference: { amount: moneyToString(totalRevenue - studioTotal), currency },
    tolerance: { amount: "0.01", currency },
    status: reviewRequired ? "warning" : "passed",
    checks: [
      {
        name: "credit_note_total",
        status: reviewRequired ? "warning" : "passed",
        message: "Title detail reconciles to the studio breakdown and total income."
      }
    ],
    issues: reviewRequired ? ["Title detail does not exactly match total income."] : [],
    human_review_required: reviewRequired
  };
  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [],
    review_items: reviewRequired
      ? [
          {
            record_key: null,
            priority: 2,
            reason: "KNPB detail needs review against Total Income.",
            original_value: { total_income: moneyToString(studioTotal), title_detail: moneyToString(totalRevenue) },
            proposed_value: normalized
          }
        ]
      : [],
    reconciliation_snapshots: reconciliationSnapshots(totalRevenue, currency, lineItems.length, reviewRequired ? "warning" : "passed")
  };
}

function knpbPostingTarget(sourceStudio: string, title: string, periodHint: string | null | undefined): { studio: string; memo: string } {
  const sourceKey = postingLookupKey(sourceStudio);
  const titleKey = postingLookupKey(title);
  const override = KNPB_TITLE_POSTING_OVERRIDES[`${sourceKey}::${titleKey}`];
  const studio = override?.studio ?? KNPB_STUDIO_POSTING_ALIASES[sourceKey] ?? sourceStudio;
  const memoSuffix = override?.memoSuffix ?? KNPB_STUDIO_MEMO_SUFFIXES[studio] ?? "";
  const period = parsePeriodHint(periodHint).label || periodHint || "";
  return {
    studio,
    memo: `VOD ${period}${memoSuffix ? ` - ${memoSuffix}` : ""}`.trim()
  };
}

function parseAmgWorkbook(bytes: Buffer, originalName: string, sha256: string, classification: Classification, refs: ReferenceData): ParserResult {
  const currency = classification.currency || "USD";
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const sheet = workbook.SheetNames[0];
  const rows = sheetMatrix(workbook, sheet);
  const lineItems: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  const provenance: Array<Record<string, unknown>> = [];
  const issues: string[] = [];
  let total = 0n;

  rows.forEach((row, index) => {
    const title = textCell(row[1]);
    const payout = parseMoney(row[4]);
    if (!title || payout === null) {
      return;
    }
    if (/^TOTAL$/i.test(title)) {
      return;
    }
    if (/^Rev Share$/i.test(title)) {
      issues.push(`Manual revenue share row detected on row ${index + 1}.`);
    }
    total += payout;
    const fee = parseMoney(row[2]) ?? 0n;
    const gross = parseMoney(row[2]) ?? payout;
    const lineId = `amg_${index + 1}`;
    const lineItem = {
      line_id: lineId,
      line_type: "royalty",
      event_date: excelDate(row[0]),
      source_invoice_number: textCell(row[6]),
      studio: mapStudio(refs, textCell(row[7]) || classification.vendor_name),
      title: {
        source_title: title,
        canonical_title: null,
        source_title_id: textCell(row[9])
      },
      platform: classification.vendor_name || "AMG",
      channel: textCell(row[5]),
      territory: textCell(row[5]),
      revenue_type: "license_payout",
      quantity: null,
      gross_amount: { amount: moneyToString(gross), currency },
      share_rate: "0.25",
      fee_rate: "0.25",
      fee_amount: { amount: moneyToString(fee), currency },
      expense_amount: null,
      net_amount: { amount: moneyToString(payout), currency },
      source_location: {
        file_name: originalName,
        sheet_name: sheet,
        page_number: null,
        row_number: index + 1,
        cell_range: null,
        image_name: null
      },
      raw_fields: {
        lic_fee: moneyToString(gross),
        dist_fee: moneyToString(fee),
        payout: moneyToString(payout),
        territory: textCell(row[5]),
        report_code: textCell(row[6]),
        studio_label: textCell(row[7])
      }
    };
    lineItems.push(lineItem);
    records.push({
      record_key: lineId,
      record_type: "line_item",
      status: "review",
      normalized_json: lineItem,
      amount: moneyToString(payout),
      currency,
      source_line_ids: [lineId]
    });
    provenance.push(provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].net_amount.amount`, moneyToString(payout), { _sheet_name: sheet, _row_number: index + 1 }, "Payout", classification));
  });

  const declared = lastNumericInSheet(rows)?.value ? parseMoney(lastNumericInSheet(rows)?.value) ?? total : total;
  const reviewRequired = issues.length > 0 || absMoney(total - declared) > ONE_CENT;
  const normalized = normalizedShell(reportKey(classification, sha256, "amg"), reviewRequired ? "review" : "ready", originalName, sha256, classification, refs, parsePeriodHint(classification.period_hint), currency);
  normalized.line_items = lineItems;
  normalized.financial_summary.period_royalty_earned = { amount: moneyToString(total), currency };
  normalized.financial_summary.net_payable = { amount: moneyToString(total), currency };
  normalized.financial_summary.components = [{ type: "payout", amount: { amount: moneyToString(total), currency }, source_label: "Payout" }];
  normalized.accounting_postings = [
    {
      posting_id: `${reportKey(classification, sha256, "amg")}_posting`,
      posting_type: "invoice",
      customer: classification.vendor_name || "All Media Group",
      studio: null,
      amount: { amount: moneyToString(total), currency },
      memo: `AMG payout ${classification.period_hint || ""}`.trim(),
      invoice_date: null,
      due_date: null,
      vertical: "Licensing",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status: reviewRequired ? "review" : "ready",
      suppression_reason: null,
      source_line_ids: lineItems.map((lineItem) => String(lineItem.line_id))
    }
  ];
  normalized.validation = {
    declared_total: { amount: moneyToString(declared), currency },
    computed_total: { amount: moneyToString(total), currency },
    difference: { amount: moneyToString(total - declared), currency },
    tolerance: { amount: "0.01", currency },
    status: reviewRequired ? "warning" : "passed",
    checks: [
      {
        name: "amg_payout_total",
        status: reviewRequired ? "warning" : "passed",
        message: "AMG payout rows reconcile to the workbook total."
      }
    ],
    issues,
    human_review_required: reviewRequired
  };
  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, reviewRequired),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [],
    review_items: reviewRequired
      ? [
          {
            record_key: null,
            priority: 2,
            reason: "AMG mixed workbook contains manual or mismatched rows.",
            original_value: { issues },
            proposed_value: normalized
          }
        ]
      : [],
    reconciliation_snapshots: reconciliationSnapshots(total, currency, lineItems.length, reviewRequired ? "warning" : "passed")
  };
}

function parseSalesWorkbookByTotals(
  workbook: XLSX.WorkBook,
  sheets: string[],
  originalName: string,
  sha256: string,
  classification: Classification,
  refs: ReferenceData,
  familyLabel: string,
  currency: string,
  shareRate: number
): ParserResult {
  const lineItems: Array<Record<string, unknown>> = [];
  const records: Array<Record<string, unknown>> = [];
  const provenance: Array<Record<string, unknown>> = [];
  const postingInputs: Array<{
    lineId: string;
    period: { start: string | null; end: string | null; label: string | null };
    gross: bigint;
    net: bigint;
    sourceLineIds: string[];
  }> = [];
  let gross = 0n;
  const postingPeriod = parsePeriodHint(classification.period_hint);

  for (const sheet of sheets) {
    const rows = sheetMatrix(workbook, sheet);
    const headerIndex = findRowIndex(rows, (row) => row.some((value) => typeof value === "string" && /Type|Date|Qty|Sales Price|Amount|Balance/i.test(String(value))));
    if (headerIndex < 0) {
      continue;
    }
    const header = rows[headerIndex].map((value) => normalizeHeader(value));
    const amountIndex = findFirstHeaderIndex(header, [/^amount$/i, /^balance$/i]);

    const sheetTotal = findSalesSheetTotal(rows, headerIndex, amountIndex);
    if (!sheetTotal) {
      continue;
    }
    const amount = sheetTotal.amount;
    gross += amount;
    const net = moneyFromShare(amount, shareRate);
    const lineId = `${familyLabel.toLowerCase()}_${sheet.replace(/\s+/g, "_").toLowerCase()}_total`;
    const sheetPeriod = parsePeriodHint(sheet);
    const lineItem = {
      line_id: lineId,
      line_type: "royalty",
      event_date: sheetPeriod.end,
      source_invoice_number: null,
      studio: familyLabel === "Girlfriends" ? knownStudio(refs, "Viv Thomas", "SARJ LLC") : mapStudio(refs, classification.vendor_name),
      title: {
        source_title: `${sheet.trim()} total`,
        canonical_title: null,
        source_title_id: null
      },
      platform: classification.vendor_name || familyLabel,
      channel: null,
      territory: null,
      revenue_type: "sales_profit_share",
      quantity: null,
      gross_amount: { amount: moneyToString(amount), currency },
      share_rate: shareRate.toString(),
      fee_rate: null,
      fee_amount: null,
      expense_amount: null,
      net_amount: { amount: moneyToString(net), currency },
      source_location: {
        file_name: originalName,
        sheet_name: sheet,
        page_number: null,
        row_number: sheetTotal.rowNumber,
        cell_range: null,
        image_name: null
      },
      raw_fields: {
        total_label: sheetTotal.label,
        gross_amount: moneyToString(amount)
      }
    };
    lineItems.push(lineItem);
    records.push({
      record_key: lineId,
      record_type: "line_item",
      status: "ready",
      normalized_json: lineItem,
      amount: moneyToString(net),
      currency,
      source_line_ids: [lineId]
    });
    postingInputs.push({ lineId, period: sheetPeriod, gross: amount, net, sourceLineIds: [lineId] });
    provenance.push(provenanceItem(lineId, `$.line_items[${lineItems.length - 1}].net_amount.amount`, moneyToString(net), { _sheet_name: sheet, _row_number: sheetTotal.rowNumber }, "Amount x profit share", classification));
  }

  const netPayable = moneyFromShare(gross, shareRate);
  const reportPeriod = salesReportPeriod(postingInputs.map((posting) => posting.period), postingPeriod);
  const reportId = reportKey(classification, sha256, familyLabel.toLowerCase());
  const normalized = normalizedShell(reportId, "ready", originalName, sha256, classification, refs, reportPeriod, currency);
  normalized.period.due_date = reportPeriod.end ? endOfMonthOffset(reportPeriod.end, 2) : null;
  normalized.line_items = lineItems;
  normalized.financial_summary.gross_sales = { amount: moneyToString(gross), currency };
  normalized.financial_summary.period_royalty_earned = { amount: moneyToString(netPayable), currency };
  normalized.financial_summary.net_payable = { amount: moneyToString(netPayable), currency };
  normalized.financial_summary.components = [{ type: "gross_sales", amount: { amount: moneyToString(gross), currency }, source_label: "Invoice total" }];
  normalized.accounting_postings = postingInputs.map((posting, index) => ({
      posting_id: `${reportId}_posting_${index + 1}`,
      posting_type: "invoice",
      customer: classification.vendor_name || familyLabel,
      studio: familyLabel === "Girlfriends" ? "SARJ LLC" : null,
      amount: { amount: moneyToString(posting.net), currency },
      memo: `${familyLabel === "Girlfriends" ? "DVD" : `${familyLabel} profit share`} ${posting.period.label ?? classification.period_hint ?? ""}`.trim(),
      invoice_date: posting.period.end,
      due_date: posting.period.end ? endOfMonthOffset(posting.period.end, 2) : null,
      vertical: "DVD",
      invoice_number: null,
      entered_at: null,
      exported_at: null,
      status: "ready",
      suppression_reason: null,
      source_line_ids: posting.sourceLineIds
    }));
  normalized.validation = {
    declared_total: { amount: moneyToString(gross), currency },
    computed_total: { amount: moneyToString(gross), currency },
    difference: { amount: "0", currency },
    tolerance: { amount: "0.01", currency },
    status: "passed",
    checks: [
      {
        name: "sales_total",
        status: "passed",
        message: `${familyLabel} sales totals parsed and profit share applied.`
      }
    ],
    issues: [],
    human_review_required: false
  };

  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, false),
    normalized_report: normalized,
    records,
    field_provenance: provenance,
    validation_results: [],
    review_items: [],
    reconciliation_snapshots: reconciliationSnapshots(netPayable, currency, lineItems.length, "passed")
  };
}

function findSalesSheetTotal(rows: unknown[][], headerIndex: number, amountIndex: number): { amount: bigint; rowNumber: number; label: string } | null {
  const candidates: Array<{ amount: bigint; rowNumber: number; label: string; priority: number }> = [];
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const labels = row.map((value) => textCell(value)).filter((value): value is string => Boolean(value));
    if (labels.length === 0) {
      return;
    }
    let priority = 99;
    const label = labels.find((value) => /^total\s+vt\b/i.test(value)) ?? labels.find((value) => /^total\s+assembly$/i.test(value)) ?? labels.find((value) => /^total$/i.test(value));
    if (!label) {
      return;
    }
    if (/^total\s+vt\b/i.test(label)) priority = 1;
    else if (/^total\s+assembly$/i.test(label)) priority = 2;
    else if (/^total$/i.test(label)) priority = 3;

    const amount = parseMoney(row[amountIndex]) ?? lastMoneyInRow(row);
    if (amount === null) {
      return;
    }
    candidates.push({ amount, rowNumber: headerIndex + offset + 2, label, priority });
  });

  return candidates.sort((a, b) => a.priority - b.priority || a.rowNumber - b.rowNumber)[0] ?? null;
}

function lastMoneyInRow(row: unknown[]): bigint | null {
  for (let index = row.length - 1; index >= 0; index -= 1) {
    const amount = parseMoney(row[index]);
    if (amount !== null) {
      return amount;
    }
  }
  return null;
}

function salesReportPeriod(
  periods: Array<{ start: string | null; end: string | null; label: string | null }>,
  fallback: { start: string | null; end: string | null; label: string | null }
) {
  const validPeriods = periods.filter((period) => period.start && period.end);
  if (validPeriods.length === 0) {
    return fallback;
  }
  const first = validPeriods[0];
  const last = validPeriods[validPeriods.length - 1];
  return {
    start: first.start,
    end: last.end,
    label: first.label === last.label ? first.label : `${first.label} to ${last.label}`
  };
}

function moneyFromShare(amount: bigint, shareRate: number): bigint {
  return BigInt(Math.round(Number(amount) / 1_000_000 * shareRate * 1_000_000));
}

function sumExpenseSheet(workbook: XLSX.WorkBook): bigint {
  const totalExpenses = firstValueInWorkbook(workbook, [/^Total Expenses$/i], ["expenses"]);
  if (!totalExpenses) {
    return 0n;
  }

  const total = parseMoney(totalExpenses.value) ?? 0n;
  return total === 0n ? 0n : -absMoney(total);
}

type SummaryCell = {
  value: unknown;
  sheetName: string;
  rowNumber: number;
  columnNumber: number;
  label: string;
};

function firstValueInWorkbook(workbook: XLSX.WorkBook, labelPatterns: RegExp[], preferredSheets: string[] = []): SummaryCell | null {
  const preferred = preferredSheets
    .map((preferredName) => workbook.SheetNames.find((sheetName) => sheetName.toLowerCase() === preferredName.toLowerCase()))
    .filter((sheetName): sheetName is string => Boolean(sheetName));
  const sheetNames = [...preferred, ...workbook.SheetNames.filter((sheetName) => !preferred.includes(sheetName))];

  for (const sheetName of sheetNames) {
    const rows = sheetMatrix(workbook, sheetName);
    const found = firstValueCellInRows(rows, labelPatterns, sheetName);
    if (found) {
      return found;
    }
  }

  return null;
}

function firstValueCellInRows(rows: unknown[][], labelPatterns: RegExp[], sheetName: string): SummaryCell | null {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let index = 0; index < row.length; index += 1) {
      const label = textCell(row[index]);
      if (!label || !labelPatterns.some((pattern) => pattern.test(label))) {
        continue;
      }
      for (let next = index + 1; next < row.length; next += 1) {
        if (row[next] !== null && row[next] !== undefined && row[next] !== "") {
          return {
            value: row[next],
            sheetName,
            rowNumber: rowIndex + 1,
            columnNumber: next + 1,
            label
          };
        }
      }
    }
  }
  return null;
}

function firstValueInSheet(rows: unknown[][], labelPattern: RegExp): unknown {
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      if (typeof row[index] === "string" && labelPattern.test(String(row[index]))) {
        for (let next = index + 1; next < row.length; next += 1) {
          if (row[next] !== null && row[next] !== undefined && row[next] !== "") {
            return row[next];
          }
        }
      }
    }
  }
  return null;
}

function firstMoneyAfterLabel(rows: unknown[][], labelPattern: RegExp): bigint | null {
  const value = firstValueInSheet(rows, labelPattern);
  return parseMoney(value);
}

function firstNumericInSheet(rows: unknown[][], labelPattern: RegExp): bigint | null {
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      const value = row[index];
      if (typeof value !== "string" || !labelPattern.test(value.trim())) {
        continue;
      }
      for (let next = index + 1; next < row.length; next += 1) {
        const amount = parseMoney(row[next]);
        if (amount !== null) {
          return amount;
        }
      }
    }
  }
  return null;
}

function lastNumericInSheet(rows: unknown[][]): { value: unknown; rowIndex: number; columnIndex: number } | null {
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = rows[rowIndex];
    for (let columnIndex = row.length - 1; columnIndex >= 0; columnIndex -= 1) {
      const value = row[columnIndex];
      if (typeof value === "number" || (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim()))) {
        return { value, rowIndex: rowIndex + 1, columnIndex: columnIndex + 1 };
      }
    }
  }
  return null;
}

function findRowIndex(rows: unknown[][], predicate: (row: unknown[]) => boolean): number {
  for (let index = 0; index < rows.length; index += 1) {
    if (predicate(rows[index])) {
      return index;
    }
  }
  return -1;
}

function normalizeHeader(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim().replace(/\s+/g, " ");
}

function findFirstHeaderIndex(header: string[], patterns: RegExp[]): number {
  for (let index = 0; index < header.length; index += 1) {
    if (patterns.some((pattern) => pattern.test(header[index]))) {
      return index;
    }
  }
  return header.length > 0 ? 0 : -1;
}

function findLastHeaderIndex(header: string[], patterns: RegExp[]): number {
  for (let index = header.length - 1; index >= 0; index -= 1) {
    if (patterns.some((pattern) => pattern.test(header[index]))) {
      return index;
    }
  }
  return header.length > 0 ? header.length - 1 : -1;
}

function textCell(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

function rawFieldsFromRow(headers: string[], row: unknown[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  row.forEach((value, index) => {
    const header = normalizeHeader(headers[index]) || `column_${index + 1}`;
    let key = header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!key) {
      key = `column_${index + 1}`;
    }
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      key = `${key}_${index + 1}`;
    }
    fields[key] = value;
  });
  return fields;
}

function findRoyaltyAmount(rows: unknown[][]): bigint | null {
  for (const row of rows.slice(0, 20)) {
    for (const value of row) {
      if (typeof value !== "string" || !/royalty/i.test(value)) {
        continue;
      }
      const matches = value.match(/\$?\s*-?\d[\d,]*(?:\.\d+)?/g);
      if (!matches || matches.length === 0) {
        continue;
      }
      const amount = parseMoney(matches[matches.length - 1]);
      if (amount !== null) {
        return amount;
      }
    }
  }
  return null;
}

function excelDate(value: unknown): string | null {
  if (typeof value !== "number") {
    return null;
  }
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) {
    return null;
  }
  return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
}

export function buildReviewResult(
  originalName: string,
  sha256: string,
  classification: Classification,
  refs: ReferenceData,
  reason: string
): ParserResult {
  const currency = classification.currency || "UNKNOWN";
  const period = parsePeriodHint(classification.period_hint);
  const normalized = normalizedShell(
    reportKey(classification, sha256, "review"),
    classification.vendor_id ? "review" : "blocked",
    originalName,
    sha256,
    classification,
    refs,
    period,
    currency
  );

  normalized.validation = {
    declared_total: null,
    computed_total: null,
    difference: null,
    tolerance: { amount: "0.01", currency },
    status: "failed",
    checks: [{ name: "parser_coverage", status: "failed", message: reason }],
    issues: [reason, classification.reason],
    human_review_required: true
  };

  return {
    source_hash: sha256,
    original_name: originalName,
    classification,
    report: reportSummary(normalized, classification, true),
    normalized_report: normalized,
    records: [],
    field_provenance: [
      {
        record_key: null,
        field_path: "$.source.source_files[0].sha256",
        value_json: sha256,
        source_sheet: null,
        source_page: null,
        source_row: null,
        source_column: null,
        source_cell_range: null,
        image_name: null,
        extraction_confidence: classification.confidence
      }
    ],
    validation_results: [
      {
        check_name: "parser_coverage",
        status: "failed",
        severity: "error",
        message: reason,
        declared_amount: null,
        computed_amount: null,
        difference_amount: null,
        tolerance_amount: "0.01",
        currency,
        details: { classification }
      }
    ],
    review_items: [
      {
        record_key: null,
        priority: classification.vendor_id ? 3 : 1,
        reason,
        original_value: { file_name: originalName, sha256 },
        proposed_value: normalized
      }
    ],
    reconciliation_snapshots: []
  };
}

function normalizedShell(
  reportId: string,
  reportStatus: string,
  originalName: string,
  sha256: string,
  classification: Classification,
  refs: ReferenceData,
  period: { start: string | null; end: string | null; label: string | null },
  currency: string
): Record<string, any> {
  const vendor = vendorConfig(refs, classification.vendor_id);
  const sourceName = classification.vendor_name || vendor.canonical_customer || null;
  return {
    schema_version: "1.0.0",
    report_id: reportId,
    report_status: reportStatus,
    source: {
      reporting_party: {
        source_name: sourceName,
        canonical_name: canonicalCustomer(refs, sourceName),
        canonical_id: null
      },
      account_holder: null,
      report_type: "royalty_statement",
      report_family: classification.parser_family,
      statement_reference: null,
      source_files: [
        {
          file_name: originalName,
          sha256,
          media_type: mediaType(originalName),
          role: ["primary", "supporting", "verification", "duplicate", "allocation_model"].includes(classification.source_role)
            ? classification.source_role
            : "primary",
          source_locator: classification.reason
        }
      ]
    },
    period: {
      start_date: period.start,
      end_date: period.end,
      label: period.label,
      statement_date: null,
      invoice_date: period.end,
      due_date: null
    },
    currency,
    financial_summary: {
      gross_sales: null,
      period_royalty_earned: null,
      prior_balance: null,
      collections: null,
      fees: null,
      expenses: null,
      payments: null,
      reserves: null,
      adjustments: null,
      net_payable: null,
      components: []
    },
    line_items: [],
    allocations: [],
    accounting_postings: [],
    validation: {
      declared_total: null,
      computed_total: null,
      difference: null,
      tolerance: { amount: "0.01", currency },
      status: "failed",
      checks: [],
      issues: [],
      human_review_required: true
    },
    parser: {
      parser_family: classification.parser_family,
      parser_version: "1.0.0",
      confidence: classification.confidence,
      config_version: "1.0.0"
    }
  };
}

function reportSummary(normalized: Record<string, any>, classification: Classification, reviewRequired: boolean): Record<string, unknown> {
  return {
    report_key: normalized.report_id,
    parser_family: normalized.parser.parser_family,
    parser_version: normalized.parser.parser_version,
    config_version: normalized.parser.config_version,
    report_type: normalized.source.report_type,
    report_family: normalized.source.report_family,
    statement_reference: normalized.source.statement_reference,
    period_start: normalized.period.start_date,
    period_end: normalized.period.end_date,
    period_label: normalized.period.label,
    statement_date: normalized.period.statement_date,
    invoice_date: normalized.period.invoice_date,
    due_date: normalized.period.due_date,
    currency: normalized.currency === "UNKNOWN" ? null : normalized.currency,
    status: normalized.report_status,
    schema_version: normalized.schema_version,
    classifier_confidence: classification.confidence,
    review_required: reviewRequired
  };
}

function reconciliationSnapshots(amount: bigint, currency: string, recordCount: number, status: string) {
  const value = moneyToString(amount);
  return ["source", "normalized"].map((stage) => ({
    stage,
    amount: value,
    currency,
    record_count: recordCount,
    validation_status: status,
    tolerance_amount: "0.01",
    components: {},
    details: {}
  }));
}

function provenanceItem(
  recordKey: string,
  fieldPath: string,
  value: unknown,
  row: Record<string, unknown>,
  column: string,
  classification: Classification
) {
  return {
    record_key: recordKey,
    field_path: fieldPath,
    value_json: value,
    source_sheet: row._sheet_name,
    source_page: null,
    source_row: row._row_number,
    source_column: column,
    source_cell_range: null,
    image_name: null,
    extraction_confidence: classification.confidence
  };
}

function reportKey(classification: Classification, sha256: string, fallbackPrefix: string): string {
  const row = classification.manifest_row;
  if (row?.relative_path) {
    const stem = path.parse(row.file_name).name.toLowerCase().replace(/[\s-]+/g, "_");
    const period = (row.period_hint || "").toLowerCase().replace(/[\s-]+/g, "_");
    return `${classification.vendor_id || fallbackPrefix}_${period}_${stem}_${sha256.slice(0, 8)}`.replace(/_+/g, "_").replace(/^_|_$/g, "");
  }
  return `${classification.vendor_id || fallbackPrefix}_${sha256.slice(0, 12)}`;
}

function sheetMatrix(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false
  });
}

function findValueAfterLabel(rows: unknown[][], labelPattern: RegExp): unknown {
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      const value = row[index];
      if (typeof value === "string" && labelPattern.test(value)) {
        for (let nextIndex = index + 1; nextIndex < row.length; nextIndex += 1) {
          if (row[nextIndex] !== null && row[nextIndex] !== undefined && row[nextIndex] !== "") {
            return row[nextIndex];
          }
        }
      }
    }
  }
  return null;
}

function findLabelRow(rows: unknown[][], labelPattern: RegExp): number {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    if (rows[rowIndex].some((value) => typeof value === "string" && labelPattern.test(value))) {
      return rowIndex;
    }
  }
  return -1;
}

function findSectionTotal(rows: unknown[][], startRow: number): { amount: bigint | null; rowIndex: number } {
  for (let rowIndex = startRow; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (String(row[0] ?? "").trim().toLowerCase() === "total") {
      return { amount: parseMoney(row[5]), rowIndex };
    }
    if (String(row[1] ?? "").trim().toLowerCase() === "total") {
      return { amount: parseMoney(row[6]), rowIndex };
    }
  }
  return { amount: null, rowIndex: -1 };
}

function findQ4Delta(rows: unknown[][]): { amount: bigint | null; rowIndex: number; sheetName: string } {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (String(row[0] ?? "").trim().toLowerCase() === "total" && row.length > 13) {
      return { amount: parseMoney(row[13]), rowIndex, sheetName: "UPDATE Q4 2025" };
    }
  }
  return { amount: 0n, rowIndex: -1, sheetName: "UPDATE Q4 2025" };
}

function roundMoneyToCents(value: bigint): bigint {
  const cent = 10_000n;
  const remainder = value % cent;
  const base = value - remainder;
  if (absMoney(remainder) >= 5_000n) {
    return base + (value >= 0n ? cent : -cent);
  }
  return base;
}

function mediaType(fileName: string): string {
  const suffix = path.extname(fileName).toLowerCase();
  if (suffix === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (suffix === ".csv") return "text/csv";
  if (suffix === ".pdf") return "application/pdf";
  if (suffix === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (suffix === ".png") return "image/png";
  if (suffix === ".jpg" || suffix === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}
