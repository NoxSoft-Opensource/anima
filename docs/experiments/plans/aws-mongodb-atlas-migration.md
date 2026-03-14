---
title: AWS + MongoDB Atlas Migration Plan
summary: Target architecture and phased rollout for moving the broader NoxSoft stack onto AWS with MongoDB Atlas on AWS.
---

# AWS + MongoDB Atlas Migration Plan

## Decision

Adopt a single-cloud target:

- AWS for application runtime, networking, object storage, secrets, email, and observability
- MongoDB Atlas on AWS for the primary application datastore where document access patterns fit
- Atlas startup credits plus AWS startup credits as the short-term cost lever

This is a startup-credit-assisted migration, not an assumption that Atlas is permanently the cheapest database.

## Target Architecture

### Runtime

- CloudFront as the public edge
- Route 53 for DNS
- ECS Fargate for long-running APIs and workers
- Lambda for event handlers, cron fan-out, lightweight webhooks, and glue code
- EventBridge for system events and scheduled triggers
- S3 for file storage, exports, backups, and static assets
- SES for transactional email
- Secrets Manager and SSM Parameter Store for application secrets and config
- CloudWatch for logs, metrics, alarms, and dashboards

### Data

- MongoDB Atlas on AWS for primary document data
- Atlas Search where search relevance matters more than simple filtering
- S3 as the file and blob store instead of storing binary payloads in MongoDB
- Redis only if queueing, rate limiting, or hot cache pressure proves necessary

### Networking

- Atlas deployed only in AWS regions that match the application runtime
- Private connectivity between AWS workloads and Atlas via PrivateLink or VPC peering
- No public database access outside tightly controlled bootstrap paths

### Security Baseline

- Atlas dedicated clusters only for production
- Atlas network allowlists locked to AWS private connectivity only
- AWS IAM authentication to Atlas wherever supported by the runtime pattern
- AWS KMS customer-managed keys for encryption control
- Separate AWS accounts or at minimum strong environment boundaries for prod vs non-prod
- CloudTrail, GuardDuty, Security Hub, and AWS Config enabled in the AWS org

## Why This Direction

### Short-term economics

- Atlas startup credits can materially reduce early cash burn
- AWS startup credits can absorb part of the runtime, networking, and storage bill
- Atlas security and operational tooling reduce the amount of infrastructure we need to self-manage immediately

### Long-term tradeoff

- Atlas is not automatically cheaper than Postgres forever
- The value case is stronger if:
  - we win startup credits
  - the data model is document-heavy
  - we use Atlas features we would otherwise have to build or self-host

## Startup Credit Track

Pursue both programs immediately:

1. AWS Activate application
2. MongoDB for Startups application
3. MongoDB AI Innovators application if any product surfaces are AI-heavy and eligible

Record:

- application owner
- application date
- expected credit window
- approved amount
- expiration date
- workloads covered by each credit pool

Credits should offset the first migration waves, but the architecture must still be viable after credits expire.

## Deep AWS + Atlas Integration

### Mandatory

- Atlas on AWS only
- Region alignment between ECS/Lambda and Atlas
- PrivateLink or VPC peering before production cutover
- AWS KMS-backed encryption keys
- S3-backed file strategy
- CloudWatch alarms on app latency, Lambda errors, queue lag, and Atlas connection pressure

### Strongly recommended

- IAM-based auth patterns where the runtime supports it
- EventBridge-driven async flows instead of ad hoc internal polling
- Lambda for low-duty-cycle integration tasks
- ECS services for stateful, long-running, or websocket-heavy workloads

### Avoid

- Multi-cloud Atlas at this stage
- Public Atlas ingress from the internet
- Storing large user files directly in MongoDB
- Rebuilding Supabase-like auth, storage, and realtime in one step without service boundaries

## Service Placement Rules

### Good MongoDB candidates

- user profile documents
- conversation/session documents
- event logs with document-style access
- notification state
- app configuration and preference blobs
- content entities that are naturally hierarchical and sparse

### Bad MongoDB candidates

- deeply relational membership graphs with heavy joins
- finance-grade ledger workflows that demand strict relational semantics
- large binary assets
- analytics scans that belong in a warehouse or search index

## Migration Sequence

### Phase 0: Foundation

- create AWS org or environment boundaries
- establish naming, tagging, billing alerts, and base IAM roles
- apply for AWS and MongoDB startup programs
- choose the primary AWS region
- create Atlas org, projects, and production/non-production boundaries

### Phase 1: Shared Platform

- create VPCs, subnets, NAT strategy, and security groups
- wire Atlas private connectivity
- configure KMS, Secrets Manager, SES, S3, CloudFront, Route 53, and CloudWatch
- build deployment pipelines for ECS and Lambda

### Phase 2: First Low-Risk Services

- move file-backed or document-heavy services first
- use strangler routing where possible
- preserve old data paths until reads and writes are verified

### Phase 3: Auth and Realtime Replacements

- split auth, storage, realtime, and data migration into explicit tracks
- do not treat this as a database-only swap
- replace Supabase-specific assumptions before final cutover

### Phase 4: Hard Cutover

- freeze writes where required
- run final replication
- cut DNS and traffic
- keep rollback paths alive until validation windows pass

## Execution Backlog Seed

### Platform

- choose one AWS region for all first-wave workloads
- create a startup-credit tracker with expiry dates and owners
- create an Atlas project per environment
- define VPC CIDR allocations before peering or PrivateLink work starts
- define S3 bucket layout for user media, exports, and internal artifacts
- define Secrets Manager naming and rotation standards

### Security

- require private database connectivity for production
- require CMK-backed encryption for production Atlas projects
- define least-privilege IAM roles for ECS tasks and Lambda functions
- enable CloudTrail, GuardDuty, Security Hub, and AWS Config
- define incident response owners and alarms before production traffic

### Application

- classify each service as document-first, relational-first, or hybrid
- identify each Supabase dependency by capability: auth, storage, realtime, row security, SQL CRUD
- define service-specific migration contracts before any schema port
- move file storage out to S3 with signed URL patterns
- introduce async event boundaries before moving heavy workflows

### Cost

- set monthly alerts at 25%, 50%, 75%, and 90% of the post-credit target budget
- track Atlas cluster cost separately from AWS runtime cost
- track PrivateLink, NAT, and data transfer explicitly
- prohibit new managed services without a line-item owner

## Kill Criteria

Pause the migration if any of these become true:

- Atlas credits are denied and the cost model no longer works
- the target workload is mostly relational and MongoDB no longer fits the access pattern
- PrivateLink or peering creates unacceptable complexity relative to the service value
- post-credit monthly spend projects above the agreed budget envelope

## First 10 Actions

1. Apply to AWS Activate.
2. Apply to MongoDB for Startups.
3. Apply to MongoDB AI Innovators if eligible.
4. Choose the primary AWS region.
5. Stand up the AWS account layout and billing alarms.
6. Create Atlas org, projects, and environments on AWS.
7. Wire Atlas private connectivity from AWS.
8. Define the S3 file architecture and signed URL policy.
9. Inventory every Supabase feature by service.
10. Select the first low-risk service for the pilot migration.

## Source Notes

Official sources used for this plan:

- MongoDB Startups: https://www.mongodb.com/startup-accelerator
- MongoDB pricing: https://www.mongodb.com/pricing
- MongoDB AI Innovators: https://www.mongodb.com/company/newsroom/press-releases/mongodb-launches-ai-innovators-program-to-help-organizations-build-with-generative-ai
- MongoDB + AWS Activate: https://www.mongodb.com/company/blog/news/mongodb-startups-now-exclusive-offer-aws-activate
- Atlas security features: https://www.mongodb.com/docs/atlas/setup-cluster-security/
- Atlas additional service charges: https://www.mongodb.com/docs/atlas/billing/additional-services/
- Atlas AWS IAM auth: https://www.mongodb.com/docs/atlas/security/aws-iam-authentication/
- Atlas AWS KMS over private endpoint: https://www.mongodb.com/docs/atlas/security/aws-kms-over-private-endpoint/
- Atlas networking on AWS: https://www.mongodb.com/docs/atlas/security-vpc-peering/
- Atlas + AWS Lambda guidance: https://www.mongodb.com/docs/atlas/manage-connections-aws-lambda/
- Atlas GraphQL / AppSync integration patterns: https://www.mongodb.com/docs/atlas/graphql-api/
- Atlas Stream Processing external functions: https://www.mongodb.com/docs/atlas/atlas-stream-processing/sp-agg-externalfunction/
- Atlas snapshot export to S3 over PrivateLink: https://www.mongodb.com/products/updates/export-atlas-backup-snapshots-to-amazon-s3-over-aws-privatelink-same-region/
- AWS startup credits: https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan
