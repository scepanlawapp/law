# Multi-Tenant AI Platform for Law Firms

## 1. Architecture Overview

The system is designed as a **multi-tenant legal platform** where each law firm operates inside an isolated tenant environment.

A **Workspace** is the business-facing representation of a tenant. In most cases, one workspace represents one law firm.

A **User** is not permanently tied to a single workspace. One user may belong to multiple workspaces. This is important for roles such as accountants, external consultants, administrators, or professionals working with several law firms.

The main architectural principle is:

**The platform first determines who the user is, which workspace the user is operating in, and which tenant belongs to that workspace. Only after that resolution is complete may business services or AI services access tenant data.**

No downstream business or AI component should independently decide which tenant it wants to access.

---

# 2. Platform Layer vs Tenant Layer

The architecture is divided into two major security domains.

## Platform Layer

The Platform Layer is shared across the entire application.

It is responsible for identity, authentication, workspace membership, tenant discovery, access control, routing, and platform-level configuration.

The Platform Layer contains a **Platform Database**, sometimes also called the Master Database or Control Database.

This database does **not contain the law firm's operational legal data**.

Instead, it contains information such as:

User
→ Workspace membership
→ Role / permissions
→ Workspace
→ Tenant identifier
→ Tenant connection/configuration information

For example:

User A may have access to Workspace 1 and Workspace 3.

Workspace 1 belongs to Tenant 1.

Workspace 3 belongs to Tenant 3.

The Platform Database is therefore the source of truth for answering the question:

**"Which tenant is this user allowed to access through this workspace?"**

The Platform Layer should contain information such as users, identities, authentication mappings, workspaces, user-workspace memberships, roles, permissions, tenant registry, workspace-to-tenant mapping, tenant status, subscription information, feature flags, and references to tenant infrastructure.

The Platform Database should never be used as the main database for legal cases, clients, documents, invoices, legal research, or other tenant-owned business information.

---

# 3. Tenant Layer

Every law firm receives its own isolated **Tenant Environment**.

A tenant is not only a database.

Conceptually, a tenant represents an isolated runtime and data boundary containing everything necessary to operate that law firm's application environment.

Each tenant should have its own database, document storage, vector index or search index, conversation/context storage, audit logs, tenant configuration, and tenant-specific business services.

Depending on the deployment model, these services may either be physically separate service instances or logically isolated service instances created with tenant-specific dependencies.

For stronger isolation, the preferred architecture is that every tenant owns its own infrastructure resources.

For example:

Tenant A has Tenant A Database, Tenant A Document Storage, Tenant A Vector Index, Tenant A Context Store, and Tenant A Services.

Tenant B has completely different resources.

Tenant A services cannot accidentally query Tenant B's database because Tenant B's database connection is never available inside Tenant A's runtime context.

This is significantly safer than having every service receive a tenant ID and dynamically query a shared database.

---

# 4. Workspace and Tenant Relationship

A Workspace is the object the user sees and selects.

A Tenant is the technical isolation boundary behind the workspace.

The typical relationship is:

**Workspace → Tenant**

For example:

"Smith Legal Office" workspace
→ Tenant `tenant_7348`

A user may therefore have:

User
→ Workspace A
→ Tenant A

and

User
→ Workspace B
→ Tenant B

The user chooses the active workspace before performing operations.

Every API request must contain or resolve an **Active Workspace ID**.

The backend must never trust this ID by itself.

It must verify through the Platform Database that the authenticated user is actually a member of that workspace.

Only after this validation can the corresponding tenant be resolved.

---

# 5. Request Entry Flow

Every request begins with:

**User → Frontend → API**

The Frontend is responsible for presenting the application and allowing the user to select the active workspace.

The API receives the authenticated user identity together with the active workspace.

Authentication identifies the user.

Authorization verifies whether that user may operate inside the requested workspace.

After authentication and authorization, the request enters the **Tenant Manager**.

---

# 6. Tenant Manager

The Tenant Manager is one of the most important components in the architecture.

Its responsibility is not business logic.

Its responsibility is **tenant resolution and tenant initialization**.

The Tenant Manager receives the authenticated user and requested workspace.

It queries the Platform Database and verifies the relationship:

Authenticated User
→ UserWorkspace Membership
→ Workspace
→ Tenant

If the relationship does not exist, the request is rejected immediately.

If the relationship is valid, the Tenant Manager obtains the configuration required to initialize the tenant.

This configuration may contain references to the tenant database, document storage, vector index, context store, encryption configuration, tenant service endpoints, feature configuration, or other isolated resources.

The Tenant Manager then creates a **Tenant Context**.

The Tenant Context is an internal trusted object representing the already-authorized environment.

Conceptually it could contain information such as:

`tenantId`

`workspaceId`

`userId`

`role`

`permissions`

`database`

`documentStorage`

`vectorStore`

`conversationStore`

`tenantServices`

`auditContext`

`featureFlags`

The important architectural rule is:

**Business services do not resolve tenants. They receive a Tenant Context.**

This prevents tenant resolution logic from being duplicated throughout the application.

---

# 7. Tenant Service Container

After tenant resolution, the Tenant Manager should ideally initialize a **Tenant Service Container** or **Tenant Runtime**.

Instead of passing database connections and repositories manually across every layer, the application can create a tenant-scoped dependency container.

For example:

`tenant.services.clients`

`tenant.services.cases`

`tenant.services.documents`

`tenant.services.billing`

`tenant.services.search`

`tenant.services.ai`

`tenant.repositories`

`tenant.storage`

These services are initialized using only the infrastructure belonging to the resolved tenant.

This means that a Case Service operating inside Tenant A already contains Tenant A's repositories and Tenant A's database connection.

It does not receive `tenantId` on every method invocation.

Instead of:

`caseService.getCases(tenantId)`

the safer architectural approach is conceptually:

`tenant.services.caseService.getCases()`

Because the service itself already belongs to the tenant.

This dramatically reduces the possibility of accidentally querying another tenant.

---

# 8. Request Classification

Once the Tenant Context has been created, the request is classified into one of two main execution paths:

1. Standard deterministic application operations.
2. AI-assisted operations.

These two paths share the same tenant security model.

The difference is only how the request is processed.

---

# 9. Standard Business Request Flow

Standard requests include actions such as listing clients, listing cases, opening a matter, updating records, uploading documents, generating deterministic reports, invoice operations, permissions management, and other CRUD or business workflows.

The flow is:

**User → Frontend → API → Authentication → Workspace Authorization → Tenant Manager → Tenant Context → Tenant Business Services → Tenant Database / Storage → API Response → User**

The business service receives an already-resolved Tenant Context.

It does not perform workspace-to-tenant discovery.

For example, a request to list cases reaches the tenant's Case Service.

The Case Service queries the tenant's database.

Because that service belongs to the tenant runtime, the service has no reason to know how tenant resolution happened.

This separation is intentional.

Tenant Manager handles isolation.

Business services handle business rules.

---

# 10. AI Request Flow

AI requests follow the same initial security path:

**User → Frontend → API → Authentication → Workspace Authorization → Tenant Manager → Tenant Context**

Only after tenant resolution does the request enter the AI pipeline.

The AI pipeline should never operate before tenant resolution.

This ensures that document search, conversation retrieval, database access, and tool execution are always tenant-bound.

---

# 11. Gatekeeper / Portir

The first AI-specific component is the **Gatekeeper**, currently called Portir.

Its purpose is to determine whether the request belongs to the supported application domain and whether it is safe and appropriate to process.

It should perform lightweight checks before expensive AI reasoning occurs.

For example, the Gatekeeper may verify whether the request relates to legal work, documents, clients, cases, accounting connected with the legal practice, supported business operations, or another allowed application capability.

A completely unrelated request such as asking for tomorrow's weather could be rejected because the application is not intended to act as a general-purpose assistant.

The Gatekeeper can also perform preliminary security checks, prompt injection checks, unsupported operation detection, file validation, and tool-use restrictions.

The Gatekeeper should not be responsible for tenant resolution.

It already receives a valid Tenant Context.

---

# 12. Document Ingestion

Uploaded documents should not simply be inserted directly into an AI prompt.

Document processing should be treated as a separate pipeline.

When a user uploads a document, the API already knows the Tenant Context.

The document is therefore immediately stored inside the current tenant's Document Storage.

A recommended ingestion flow is:

**Upload → Security Validation → Tenant Document Storage → Text Extraction / OCR → Metadata Extraction → Document Classification → Chunking → Embeddings → Tenant Vector Index**

Metadata may include document ID, matter ID, client ID, document type, creation date, author, confidentiality level, source, page numbers, and access restrictions.

Every vector entry must retain a strong link back to the original document and its metadata.

The vector index must also be tenant-specific.

The system should never perform vector search across all clients and filter results afterward.

Tenant isolation should exist before the search is executed.

---

# 13. Conversation and Context Store

AI conversations require persistent context.

Conversation history should therefore also exist inside the tenant boundary.

The system should store conversations together with information such as tenant ID, workspace ID, user ID, conversation ID, referenced cases, referenced clients, referenced documents, messages, generated answers, citations, tool calls, and AI execution metadata.

Conversation context should never leak between tenants.

Even if the same user belongs to multiple workspaces, switching workspace must effectively switch the available AI context.

A conversation created inside Workspace A should not automatically become available inside Workspace B.

---

# 14. Brief Agent

After the Gatekeeper approves the request, the request reaches the **Brief Agent**.

The Brief Agent's responsibility is to convert the raw user request into a structured task that the AI system can reliably execute.

It should analyze the user message, conversation history, uploaded documents, referenced clients or matters, workspace context, and available business data.

The Brief Agent can determine what the user is asking, what information is missing, what sources may be needed, what tools may be required, and what restrictions apply.

Its output should ideally not be just another natural-language prompt.

It should produce structured execution context.

For example, conceptually:

User intent: summarize a contract.

Matter: Matter 123.

Documents: Contract A.

Required data: contract text and client information.

Allowed tools: document retrieval.

Output format: legal summary.

Risk level: medium.

Need citations: yes.

This structured brief is then passed to the AI Orchestrator.

---

# 15. AI Orchestrator

The AI Orchestrator is the central component of the AI architecture.

It should not contain all business functionality itself.

Instead, it coordinates existing capabilities.

The Orchestrator decides what information is required and which tools or services should be invoked.

It can call tenant business services, tenant document retrieval, tenant vector search, conversation memory, external legal information providers if allowed, internal calculation tools, specialized AI agents, and the LLM.

For example, if the user asks:

"Summarize the risks in the client's employment contract and tell me whether there are open disputes involving this client."

The Orchestrator might first retrieve the contract, search relevant contract clauses, call the Client Service, call the Matter Service to identify open disputes, gather structured results, build an evidence context, and then ask the LLM to generate the final answer.

The LLM should therefore not directly access databases.

The Orchestrator invokes trusted services.

Those services return structured information.

The AI reasons over that information.

---

# 16. RAG and Document Retrieval

Document retrieval should exist behind a dedicated **Document Retrieval Service**.

The AI Orchestrator asks this service for relevant information.

The service performs tenant-bound search against the tenant's vector index and document metadata.

The retrieval layer should combine semantic search with metadata filters.

For example, the AI may request:

Documents for Client X
AND Matter Y
AND document type Contract
AND uploaded before a certain date.

The retrieval result should contain source references.

Those source references should follow the information through the entire AI pipeline so that the final answer can provide citations.

This is particularly important in legal applications because users must be able to understand where statements originate.

---

# 17. Business Services Used by AI

AI should not duplicate the business logic of the application.

If the platform already has a Client Service, Matter Service, Invoice Service, Calendar Service, or Document Service, the AI should call those same services through controlled tools.

For example, AI should not independently execute SQL asking for a client's unpaid invoices.

It should call something conceptually similar to:

`tenant.services.billing.getOutstandingInvoices(clientId)`

This keeps authorization, validation, calculations, and business rules in one place.

AI then becomes another consumer of the platform's business capabilities instead of becoming a second backend implementation.

---

# 18. AI Tools

The Orchestrator exposes a controlled set of tools to the AI.

Every tool should operate on the already-created Tenant Context.

Tools should never allow the model to specify arbitrary tenant IDs.

The tenant should come from the execution environment, not from model-generated parameters.

For example, the AI may request:

`get_client(clientId)`

but it should not request:

`get_client(tenantId, clientId)`

The tenant dimension should be invisible to the model whenever possible.

This greatly reduces the risk of cross-tenant access caused by hallucinated or malicious identifiers.

---

# 19. Response Generation

Once all required information has been gathered, the AI Orchestrator constructs a controlled evidence context for the model.

That context may contain the original question, structured user intent, conversation context, retrieved document passages, business-service results, tenant-specific configuration, output requirements, and citations.

The LLM generates a candidate response.

That response is not necessarily returned directly to the user.

It first passes through the Evaluation Layer.

---

# 20. Evaluation Layer

The Evaluation Layer acts as the final AI quality gate.

It should evaluate whether the answer actually addresses the user's request, whether factual claims are supported by retrieved evidence, whether citations are valid, whether there are contradictions, whether prohibited information has been included, whether the response violates tenant or permission boundaries, and whether the output meets application-specific quality standards.

Legal AI should also distinguish between facts extracted from the tenant's documents and model interpretation.

If the evaluator determines that the answer is insufficient, the response can be returned to the Orchestrator with feedback.

For example:

Missing evidence.

One claim is unsupported.

Required document was not searched.

Answer does not address clause 7.

The Orchestrator can then perform another retrieval or reasoning cycle.

This loop should have a maximum number of iterations to avoid uncontrolled cost and infinite execution.

If evaluation succeeds, the final answer is returned to the API.

---

# 21. Human-in-the-Loop

Certain operations should not rely entirely on automated AI evaluation.

The architecture should support Human-in-the-Loop workflows for sensitive legal operations.

For example, drafting court submissions, generating final legal opinions, modifying critical case information, sending communications to external parties, executing financial actions, deleting documents, or performing actions that may create legal consequences may require explicit human confirmation.

The AI can prepare the action.

A human approves it.

Only then does the business service execute it.

---

# 22. Authorization Inside a Tenant

Tenant access alone is not enough.

A user may have access to a law firm's workspace but still not have access to every matter or document.

The system should therefore support two levels of authorization.

The first level is workspace and tenant authorization.

The second level is resource-level authorization inside the tenant.

For example, a user may be a member of Tenant A but only have access to selected cases.

Tenant Manager answers:

**"Can this user operate inside this tenant?"**

Tenant services answer:

**"Can this user perform this operation on this specific resource?"**

The Tenant Context should therefore contain the user's role and effective permissions.

---

# 23. Audit and Compliance

Every important operation should generate an audit record.

The Audit Service should capture information such as user, workspace, tenant, request ID, operation, accessed resources, document retrieval activity, AI tools used, model execution, generated response, approvals, errors, and timestamp.

AI execution should be traceable.

For sensitive applications such as legal services, it should be possible to reconstruct why an answer was produced and which sources were used.

Audit logs should themselves be protected from modification.

---

# 24. Observability

Technical observability should be separate from business audit logs.

The system should support distributed tracing, application logs, latency metrics, AI token usage, model cost, retrieval performance, error rates, tool execution duration, evaluation failure rates, and tenant-level resource consumption.

Every request should receive a unique correlation or request ID.

That ID should follow the request through API, Tenant Manager, business services, AI Orchestrator, retrieval, LLM execution, evaluation, and response.

Sensitive legal content should not automatically be written into technical logs.

---

# 25. Security Boundary

The strongest security property of the architecture should be that tenant isolation does not depend solely on application-level filtering.

Where practical, each tenant should have separate infrastructure credentials.

For example, Tenant A's runtime receives only Tenant A's database credentials and Tenant A's storage credentials.

Even if a bug exists inside a service, Tenant A's process should not possess credentials capable of reading Tenant B's database.

This creates defense in depth.

The architecture therefore provides isolation at several levels:

User authorization.

Workspace membership.

Tenant resolution.

Tenant-scoped services.

Tenant-scoped credentials.

Tenant-scoped database.

Tenant-scoped document storage.

Tenant-scoped vector index.

Resource-level permissions.

Audit logging.

---

# 26. Platform Database vs Tenant Database

It is important to clearly separate their responsibilities.

The **Platform Database** knows that a user exists, which workspaces the user belongs to, what role the user has in that workspace, which tenant belongs to the workspace, how the tenant can be initialized, and whether the tenant is active.

The **Tenant Database** knows the law firm's actual operational information.

This may include clients, matters, cases, contacts, tasks, deadlines, invoices, document metadata, time entries, notes, internal configuration, legal workflows, and other business records.

Therefore:

**Platform Database determines where the request belongs.**

**Tenant Database contains what the law firm actually works with.**

---

# 27. Recommended End-to-End Workflow

The complete architecture can be represented by the following execution path:

1. The user authenticates with the platform.
2. The frontend loads all workspaces available to the user.
3. The user selects an active workspace.
4. The frontend sends the request together with the active workspace reference.
5. The API validates authentication.
6. Authorization verifies that the user belongs to the requested workspace.
7. Tenant Manager queries the Platform Database.
8. Tenant Manager resolves Workspace → Tenant.
9. Tenant Manager initializes the Tenant Context and Tenant Service Container.
10. The request is routed either to standard business processing or to AI processing.
11. Standard requests call tenant-scoped business services directly.
12. AI requests pass through Gatekeeper → Brief Agent → AI Orchestrator.
13. The AI Orchestrator retrieves information through tenant-scoped business services and document retrieval.
14. The LLM receives only the prepared information required to answer the request.
15. A candidate response is generated.
16. The Evaluation Layer validates quality, evidence, permissions, and policy compliance.
17. If evaluation fails, the Orchestrator receives feedback and performs a controlled revision cycle.
18. If evaluation succeeds, the final response is returned to the API.
19. The API returns the response to the frontend and user.
20. Important operations are recorded in tenant audit logs and platform observability systems.

---

# 28. Core Architectural Rule

The most important rule of the entire system is:

**Tenant resolution must happen once, at the beginning of the backend request lifecycle.**

After that moment, every component should operate inside a trusted Tenant Context.

Business services should not search for tenants.

AI agents should not select tenants.

The LLM should never choose a tenant.

Document search should not search globally and then filter by tenant.

Database queries should not depend on a tenant ID invented or supplied by the model.

The infrastructure itself should enforce tenant boundaries.

This produces a much cleaner architecture:

**Identity → Workspace → Tenant → Tenant Runtime → Business / AI Processing → Evaluation → Response**

The platform layer decides **where the request belongs**.

The tenant layer decides **what the user can do with the law firm's data**.

The business layer provides deterministic legal-business capabilities.

The AI layer orchestrates those capabilities and reasons over tenant-owned information.

The evaluation layer ensures the generated answer is sufficiently reliable before it reaches the user.

Together, these layers create a secure, scalable, explainable, and extensible architecture for an AI platform intended for multiple independent law firms.
