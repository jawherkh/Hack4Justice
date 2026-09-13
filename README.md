<div align="center">
  <img src="apps/web/public/brand/dalil-mark.svg" width="104" height="104" alt="Dalil logo" />
  <h1>Dalil · دليل</h1>
  <p>
    <strong>From paperwork to a submission-ready Tunisian administrative dossier.</strong>
  </p>

  <p>
    <a href="#arabic"><img alt="Read in Arabic" src="https://img.shields.io/badge/%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9-C2410C?style=for-the-badge&logo=googletranslate&logoColor=white" /></a>
  </p>

  <p>
    <a href="https://github.com/Goodnight77/Hack4Justice/actions/workflows/ci.yml"><img alt="CI status" src="https://github.com/Goodnight77/Hack4Justice/actions/workflows/ci.yml/badge.svg" /></a>
    <img alt="Node.js 22+" src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white" />
    <img alt="pnpm 11" src="https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white" />
    <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" />
    <img alt="Arabic, French and English" src="https://img.shields.io/badge/i18n-AR_%C2%B7_FR_%C2%B7_EN-7C3AED" />
  </p>
</div>

Dalil is an open-source workspace that helps Tunisian citizens and businesses understand, assemble, validate, and track administrative procedures. It turns each procedure into a guided project with the right steps, documents, evidence, and status in one place.

The current experience covers services from the **Registre National des Entreprises (RNE)** and the **Direction Générale des Impôts (DGI)**, with Arabic right-to-left support alongside French and English.

> [!IMPORTANT]
> Dalil helps prepare and track a dossier; it does **not** file it with a government agency. The user completes the official submission on the agency's channel, then records the submission and its outcome in Dalil. Guidance is informational and does not replace advice from the competent authority or a qualified professional.

## What Dalil does

| Capability              | What it provides                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Guided procedures       | Service-specific onboarding, requirements, checklists, next actions, and a step-by-step timeline.                          |
| Document workspace      | Multi-file upload, drag-and-drop onto requirements, versioned evidence, inline PDF preview, and download.                  |
| Multilingual extraction | Native PDF text extraction plus OCR for scanned Arabic, French, and English documents.                                     |
| Grounded assistance     | A dossier-aware assistant that can search agency-scoped legal knowledge and work with authorized documents.                |
| Portable answers        | Completed assistant responses can be downloaded as Markdown or as a properly laid-out PDF.                                 |
| Submission tracking     | Readiness validation, a frozen checklist snapshot, official-channel submission records, status history, and notifications. |

### Procedures represented today

| RNE · Company registry      | DGI · Tax administration              |
| --------------------------- | ------------------------------------- |
| Company registration        | Declaration of existence and tax card |
| Company information updates | Monthly declarations                  |
| Deregistration and closure  | Annual return and tax package         |
| Electronic safe             | Tax status and certificates           |

## Architecture

Dashed arrows are user-controlled steps outside Dalil. Dalil never submits to RNE or DGI: the user submits on the official channel and records the reference or outcome in Dalil.

### User journey

```mermaid
flowchart LR
    USER(["Citizen or business<br/>مواطن أو مؤسسة"])

    subgraph DALIL["Dalil workspace · مساحة عمل دليل"]
        direction LR

        subgraph S1["1 · Discover · اكتشف"]
            direction TB
            AGENCY["Choose agency<br/>RNE or DGI"] --> SERVICE["Choose procedure"] --> PROJECT["Create a project"]
        end

        subgraph S2["2 · Prepare · حضّر"]
            direction TB
            CHECKLIST["Tailored requirements<br/>قائمة متطلبات مخصصة"] --> UPLOAD["Upload evidence"]
            UPLOAD --> PARSE{"Native text<br/>or scanned?"}
            PARSE -- "native" --> POPPLER["Poppler<br/>pdftotext · pdftoppm"]
            PARSE -- "scanned" --> OCR["DeepSeek OCR"]
            POPPLER --> TEXT["Extracted text<br/>AR · FR · EN"]
            OCR --> TEXT
            TEXT --> REVIEW["Review and attach<br/>راجع واربط الأدلة"]
            UPLOAD -.-> STORAGE[("Private storage<br/>MinIO / S3")]
        end

        subgraph S3["3 · Validate · تحقّق"]
            direction TB
            READY{"Ready for<br/>submission?"}
            READY -- "no" --> GAPS["Missing or invalid items"]
            READY -- "yes" --> SNAPSHOT["Freeze checklist snapshot"]
            SNAPSHOT --> CONFIRM(["Human confirmation<br/>تأكيد المستخدم"])
        end

        subgraph ASSIST["Assistant · المساعدة"]
            direction TB
            AGENT["Dossier-aware assistant"] --> SEARCH["Agency-scoped legal search"] --> ANSWER["Grounded answer<br/>with sources"] --> EXPORT["Export Markdown / PDF"]
        end

        subgraph S5["5 · Follow up · تابع"]
            direction TB
            RECORD["Record submission<br/>and outcome"] --> STATUS["Track review status"]
            STATUS --> CHANGES{"Changes<br/>requested?"}
            CHANGES -- "no" --> HISTORY["Versions and history"]
            STATUS --> NOTIFY["Notifications<br/>in-app · SMS · WhatsApp"]
        end
    end

    subgraph OFFICIAL["4 · Official channel · القناة الرسمية"]
        direction TB
        PORTAL["RNE or DGI channel"] --> RECEIPT["Receipt or reference"]
        PORTAL --> OUTCOME["Official outcome"]
    end

    USER --> AGENCY
    PROJECT --> CHECKLIST
    REVIEW --> READY
    GAPS --> CHECKLIST
    CHANGES -- "yes" --> GAPS
    CHECKLIST -. "dossier context" .-> AGENT
    ANSWER -. "next action" .-> GAPS
    CONFIRM -. "user submits" .-> PORTAL
    RECEIPT -. "user records" .-> RECORD
    OUTCOME -. "user records" .-> RECORD
    NOTIFY --> USER

    classDef person fill:#FFF7ED,stroke:#F0A860,color:#16213E,stroke-width:2px
    classDef dalil fill:#EFF6FF,stroke:#2563EB,color:#16213E
    classDef intel fill:#F0FDFA,stroke:#0F766E,color:#134E4A
    classDef data fill:#FAF5FF,stroke:#7C3AED,color:#4C1D95
    classDef official fill:#FFF7ED,stroke:#C2410C,color:#7C2D12
    classDef decision fill:#FFFFFF,stroke:#F0A860,color:#16213E,stroke-width:3px

    class USER,CONFIRM person
    class AGENCY,SERVICE,PROJECT,CHECKLIST,UPLOAD,REVIEW,GAPS,SNAPSHOT,RECORD,STATUS,HISTORY,NOTIFY dalil
    class POPPLER,OCR,TEXT,AGENT,SEARCH,ANSWER,EXPORT intel
    class STORAGE data
    class PORTAL,RECEIPT,OUTCOME official
    class PARSE,READY,CHANGES decision
```

### System architecture

```mermaid
flowchart TB
    subgraph ACTORS["Actors"]
        direction LR
        USER["Citizen or business"]
        OFFICER["Agency officer"]
    end

    subgraph EXPERIENCE["Experience layer"]
        direction LR
        WEB["React 19 + TanStack<br/>Arabic RTL · French · English"] --> CLIENT["Typed API client<br/>OpenAPI · SSE"]
    end

    subgraph TRUST["API trust boundary"]
        direction LR
        API["Elysia API<br/>OpenAPI · JSON · SSE"] --> AUTHZ["Authentication and<br/>access policy"]
        AUTHZ --> MODULES["Modules<br/>Projects · Documents · Assistant<br/>Exports · Notifications · Commands"]
    end

    subgraph RUNTIME["Runtime services"]
        direction LR
        subgraph DOCS["Document pipeline"]
            direction TB
            VALIDATE["Type and size validation"] --> KIND{"Native or<br/>scanned?"}
            KIND -- "native" --> POPPLER["Poppler"]
            KIND -- "scanned" --> DEEPSEEK["DeepSeek OCR"]
            POPPLER --> TEXT["Extracted text<br/>AR · FR · EN"]
            DEEPSEEK --> TEXT
        end
        subgraph WORKFLOWS["Durable execution"]
            direction TB
            EVENTS["Commands · events<br/>idempotent retries"] --> TEMPORAL["Temporal"] --> WORKER["Lifecycle and<br/>agent worker"]
        end
        subgraph AGENT["Assistant runtime"]
            direction TB
            SDK["OpenAI Agents SDK"] --> GEMINI["Gemini<br/>OpenAI-compatible"]
            SDK --> TOOLS["Server-authorized<br/>dossier tools"] --> SANDBOX["Docker sandbox<br/>non-root · no network"]
            SANDBOX --> ARTIFACTS["Drafts and artifacts"]
        end
        subgraph DELIVERY["Notification delivery"]
            direction TB
            OUTBOX["Notification outbox"] --> TWILIO["Twilio<br/>SMS · WhatsApp"]
            OUTBOX --> SIM["Simulated delivery<br/>local"]
        end
    end

    subgraph DATA["Data"]
        direction LR
        PG[("PostgreSQL<br/>Drizzle ORM")]
        S3[("MinIO / S3<br/>originals · artifacts")]
        WS[("Agent workspaces<br/>per dossier")]
    end

    subgraph KNOWLEDGE["Legal knowledge boundary"]
        direction LR
        SEARCH["Agency-scoped<br/>search adapter"] --> GRAPHITI["Graphiti<br/>ingest · hybrid search · rerank"]
        GRAPHITI <--> NEO4J[("Neo4j<br/>agency-partitioned graph")]
        SOURCES[("Approved legal sources<br/>provenance · offsets")] --> GRAPHITI
        GRAPHITI --> KMODEL["Gemini extraction<br/>and embeddings"] --> NEO4J
    end

    EXT["Official RNE / DGI channels"]

    USER --> WEB
    OFFICER --> WEB
    CLIENT -- "session cookie · HTTPS" --> API
    MODULES --> VALIDATE
    MODULES --> EVENTS
    MODULES --> SDK
    MODULES --> OUTBOX
    MODULES <--> PG
    TEXT --> PG
    WORKER <--> PG
    WORKER --> SDK
    VALIDATE --> S3
    ARTIFACTS --> S3
    SANDBOX --> WS
    TOOLS --> SEARCH
    USER -. "submits directly" .-> EXT
    EXT -. "reference / outcome<br/>entered by user" .-> WEB

    classDef actor fill:#FFF7ED,stroke:#F0A860,color:#16213E,stroke-width:2px
    classDef exp fill:#EFF6FF,stroke:#2563EB,color:#16213E
    classDef sec fill:#FFFFFF,stroke:#16213E,color:#16213E,stroke-width:3px
    classDef svc fill:#F0FDFA,stroke:#0F766E,color:#134E4A
    classDef data fill:#FAF5FF,stroke:#7C3AED,color:#4C1D95
    classDef ext fill:#FFF7ED,stroke:#C2410C,color:#7C2D12
    classDef decision fill:#FFFFFF,stroke:#F0A860,color:#16213E,stroke-width:3px

    class USER,OFFICER actor
    class WEB,CLIENT exp
    class API,AUTHZ,MODULES sec
    class VALIDATE,POPPLER,DEEPSEEK,TEXT,EVENTS,TEMPORAL,WORKER,SDK,GEMINI,TOOLS,SANDBOX,ARTIFACTS,OUTBOX,TWILIO,SIM,SEARCH,GRAPHITI,KMODEL svc
    class PG,S3,WS,NEO4J,SOURCES data
    class EXT ext
    class KIND decision
```

## Response exports

Assistant output is stored as Markdown. An authorized caller can export a completed run without depending on the web interface:

```http
GET /api/v1/dossiers/:dossierId/agent/sessions/:sessionId/runs/:runId/export?format=markdown
GET /api/v1/dossiers/:dossierId/agent/sessions/:sessionId/runs/:runId/export?format=pdf
```

The Markdown response is returned as `text/markdown`; the PDF response is rendered server-side with bidirectional text and Arabic font support.

<a id="quick-start"></a>

## Quick start

### Prerequisites

- Node.js 22 or newer and Corepack
- Docker with Docker Compose
- [uv](https://docs.astral.sh/uv/) and Python 3.12+ for the Python service and its tests
- Poppler (`pdftotext` and `pdftoppm`) when exercising PDF extraction locally

### 1. Install the workspace

```bash
git clone https://github.com/Goodnight77/Hack4Justice.git
cd Hack4Justice
corepack enable
pnpm install
uv sync --locked
```

### 2. Configure the environment

```bash
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env`. Replace the development auth secret before sharing a deployment. Set `GEMINI_API_KEY` to enable the assistant and legal knowledge service, and set `DEEPSEEK_API_KEY` to OCR scanned documents. The checked-in [`.env.example`](.env.example) is the configuration reference.

### 3. Start infrastructure and initialize storage

```bash
docker compose up -d --wait
docker compose -f apps/api/compose.workflow.yaml up -d
pnpm --filter @hack4justice/db db:migrate
pnpm --filter @hack4justice/api db:init
```

### 4. Run the applications

Start the Temporal worker in one terminal:

```bash
pnpm --filter @hack4justice/api worker
```

Start the development applications in another:

```bash
pnpm dev
```

| Service                    | Local address                   |
| -------------------------- | ------------------------------- |
| Web application            | `http://localhost:3000`         |
| API                        | `http://localhost:3001`         |
| OpenAPI explorer           | `http://localhost:3001/openapi` |
| Graphiti knowledge service | `http://localhost:8010`         |
| Temporal UI                | `http://localhost:8233`         |
| Neo4j browser              | `http://localhost:7474`         |
| MinIO console              | `http://localhost:9001`         |

## Configuration map

| Area              | Main variables                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------- |
| API and web       | `PORT`, `WEB_ORIGIN`, `VITE_API_URL`, `LOG_LEVEL`                                             |
| Identity and data | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`                                       |
| Object storage    | `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`           |
| Assistant         | `GEMINI_API_KEY`, `AGENT_MODEL`, `GEMINI_AGENT_BASE_URL`, `SANDBOX_IMAGE`, `SANDBOX_BASE_DIR` |
| OCR               | `DEEPSEEK_API_KEY`, `DEEPSEEK_OCR_ENDPOINT`, `DEEPSEEK_OCR_MODEL`                             |
| Legal knowledge   | `GRAPHITI_URL`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `GEMINI_*_MODEL`                 |
| Workflows         | `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE`                               |
| Messaging         | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM`          |

When Twilio is not configured, outbound messages are recorded as simulated so the rest of the application can still run locally.

## Repository map

```text
apps/
├── web/        React and TanStack user experience
├── api/        Elysia API, workflows, assistant, exports, and document processing
└── graphiti/   Python legal knowledge ingestion and search service
packages/
├── auth/       Better Auth integration
├── db/         Drizzle schemas and PostgreSQL migrations
├── shared/     Shared domain types, constants, and localization primitives
├── storage/    S3-compatible document storage
└── ui/         Shared interface components
contracts/      Validated schemas, fixtures, OpenAPI contract, and mock API
tests/          Python contract and knowledge-service tests
```

For deeper implementation notes, see the [API](apps/api/README.md), [web application](apps/web/README.md), [knowledge service](apps/graphiti/README.md), and [integration contracts](contracts/README.md).

## Verification

Run the same core checks used in continuous integration:

```bash
pnpm check-types
pnpm lint
pnpm test
uv run --frozen pytest tests/test_graphiti_service.py
pnpm build
```

---

<a id="arabic"></a>

<div dir="rtl" align="right">
  <h2>العربية</h2>

  <h3>ما هو دليل؟</h3>
  <p>
    <strong>دليل</strong> مساحة عمل مفتوحة المصدر تساعد المواطنين والمؤسسات في تونس على فهم الإجراءات الإدارية وتجميع وثائقها والتثبت من اكتمالها ومتابعة حالتها. يحوّل دليل كل إجراء إلى مشروع واضح يجمع المراحل والوثائق والأدلة والحالة في مكان واحد.
  </p>
  <p>
    تغطي النسخة الحالية خدمات السجل الوطني للمؤسسات (RNE) والإدارة العامة للأداءات (DGI)، وتدعم العربية باتجاه من اليمين إلى اليسار، إلى جانب الفرنسية والإنجليزية.
  </p>

  <h3>ماذا يوفّر دليل؟</h3>
  <ul>
    <li><strong>إجراءات موجّهة:</strong> اختيار الخدمة، قائمة متطلبات مناسبة، مراحل واضحة، وتعليمات للخطوة التالية.</li>
    <li><strong>مساحة للوثائق:</strong> رفع عدة ملفات، سحب الوثيقة إلى المتطلب المناسب، معاينة ملفات PDF، تنزيلها، وحفظ نسخ الأدلة.</li>
    <li><strong>استخراج متعدد اللغات:</strong> قراءة النص الأصلي من ملفات PDF واستعمال OCR للوثائق الممسوحة ضوئيا بالعربية أو الفرنسية أو الإنجليزية.</li>
    <li><strong>مساعد مرتبط بالملف:</strong> يستعمل الوثائق المصرّح بها ويبحث داخل معرفة قانونية مفصولة حسب الإدارة.</li>
    <li><strong>تصدير الأجوبة:</strong> تنزيل جواب المساعد بصيغة Markdown أو PDF مع دعم صحيح للنص العربي.</li>
    <li><strong>متابعة الإيداع:</strong> التثبت من الجاهزية، حفظ نسخة من قائمة المتطلبات، تسجيل الإيداع الرسمي، ومتابعة الحالة والإشعارات.</li>
  </ul>

  <h3>مسار الاستخدام</h3>
  <ol>
    <li>أنشئ مشروعا واختر الإدارة والخدمة المطلوبة.</li>
    <li>راجع المراحل وقائمة الوثائق الخاصة بالإجراء.</li>
    <li>ارفع الأدلة واستكمل العناصر الناقصة.</li>
    <li>بعد تأكيد الجاهزية، أودع الملف عبر القناة الرسمية للإدارة.</li>
    <li>سجّل الإيداع في دليل وتابع النتيجة والتعديلات المطلوبة.</li>
  </ol>

  <blockquote>
    <strong>تنبيه:</strong> لا يقوم دليل بإيداع الملف لدى الإدارة نيابة عن المستخدم، ولا يعوّض رأي الجهة المختصة أو الاستشارة المهنية. تتم عملية الإيداع على القناة الرسمية، ثم تُسجّل داخل دليل للمتابعة.
  </blockquote>

  <h3>تشغيل المشروع محليا</h3>
  <p>
    تتطلب البيئة Node.js 22 وDocker وpnpm. اتبع خطوات <a href="#quick-start">التشغيل السريع</a> لنسخ ملف الإعدادات، وتشغيل PostgreSQL وMinIO وNeo4j وGraphiti وTemporal، ثم تشغيل التطبيق والعامل. المفاتيح الخارجية اختيارية حسب الميزة: Gemini للمساعد والمعرفة القانونية، وDeepSeek OCR للوثائق الممسوحة ضوئيا.
  </p>
</div>

<div align="center">
  <sub>Built to make administrative procedures clearer, safer, and easier to complete.</sub><br />
  <sub dir="rtl">بُني لجعل الإجراءات الإدارية أوضح وأكثر أمانا وأسهل إنجازا.</sub>
</div>
