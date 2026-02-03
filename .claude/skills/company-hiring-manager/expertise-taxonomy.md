# Expertise Taxonomy

## Complete Domain Reference

### Frontend

#### Core Frameworks
| ID | Name | Technologies | Indicators |
|----|------|--------------|------------|
| `frontend-react` | React Specialist | React, JSX, Hooks, Context, Redux, Zustand, Next.js, Remix | `.jsx`, `.tsx`, `react` imports |
| `frontend-vue` | Vue Specialist | Vue 3, Composition API, Vuex/Pinia, Nuxt, Vite | `.vue` files |
| `frontend-angular` | Angular Specialist | Angular, RxJS, NgRx, Signals, Angular Material | `.component.ts`, `@angular` |
| `frontend-svelte` | Svelte Specialist | Svelte, SvelteKit, Svelte stores | `.svelte` files |
| `frontend-solid` | SolidJS Specialist | SolidJS, Solid Start | `solid-js` imports |

#### UI/UX
| ID | Name | Technologies | Indicators |
|----|------|--------------|------------|
| `ui-css` | CSS Specialist | Tailwind, CSS Modules, Styled Components, Sass, PostCSS | Style files, Tailwind config |
| `ui-design-system` | Design System | Component libraries, Storybook, tokens | `.stories.tsx` |
| `ui-accessibility` | Accessibility | ARIA, WCAG 2.1, screen readers, keyboard nav | A11y requirements |
| `ui-animation` | Animation | Framer Motion, GSAP, CSS animations | Animation requirements |
| `ui-responsive` | Responsive Design | Media queries, mobile-first, responsive images | Mobile requirements |

### Backend

#### Languages & Frameworks
| ID | Name | Technologies | Indicators |
|----|------|--------------|------------|
| `backend-node` | Node.js Specialist | Express, Fastify, NestJS, Koa, Hono | `package.json` server |
| `backend-python` | Python Specialist | FastAPI, Django, Flask, SQLAlchemy | `requirements.txt`, `.py` |
| `backend-go` | Go Specialist | Gin, Echo, Chi, GORM | `go.mod`, `.go` |
| `backend-rust` | Rust Specialist | Actix, Axum, Rocket, Diesel | `Cargo.toml`, `.rs` |
| `backend-java` | Java Specialist | Spring Boot, Quarkus, Micronaut | `pom.xml`, `.java` |
| `backend-dotnet` | .NET Specialist | ASP.NET Core, Entity Framework | `.csproj`, `.cs` |
| `backend-ruby` | Ruby Specialist | Rails, Sinatra, Sequel | `Gemfile`, `.rb` |
| `backend-php` | PHP Specialist | Laravel, Symfony | `composer.json`, `.php` |

#### API Design
| ID | Name | Technologies | Indicators |
|----|------|--------------|------------|
| `api-rest` | REST API | OpenAPI, RESTful design, HATEOAS | API endpoints |
| `api-graphql` | GraphQL | Apollo, Relay, schema design | GraphQL schemas |
| `api-grpc` | gRPC | Protocol buffers, service mesh | `.proto` files |
| `api-websocket` | WebSocket | Socket.io, WS, real-time | Real-time requirements |

### Data

#### Databases
| ID | Name | Technologies | Indicators |
|----|------|--------------|------------|
| `database-postgresql` | PostgreSQL | PostgreSQL, PL/pgSQL, extensions | PostgreSQL usage |
| `database-mysql` | MySQL | MySQL, MariaDB | MySQL usage |
| `database-mongodb` | MongoDB | MongoDB, Mongoose, aggregation | MongoDB usage |
| `database-redis` | Redis | Redis, caching, pub/sub | Redis usage |
| `database-elasticsearch` | Elasticsearch | Elasticsearch, OpenSearch | Search requirements |

#### Data Processing
| ID | Name | Technologies | Indicators |
|----|------|--------------|------------|
| `data-etl` | ETL Specialist | Apache Spark, dbt, Airflow | Data pipeline requirements |
| `data-analytics` | Analytics | SQL, pandas, visualization | Analytics requirements |
| `data-ml` | Machine Learning | TensorFlow, PyTorch, scikit-learn | ML requirements |

### Infrastructure

#### Containers & Orchestration
| ID | Name | Technologies | Indicators |
|----|------|--------------|------------|
| `infra-docker` | Docker Specialist | Docker, Compose, multi-stage builds | `Dockerfile` |
| `infra-kubernetes` | Kubernetes | K8s, Helm, operators | K8s manifests |
| `infra-terraform` | Terraform | Terraform, IaC, state management | `.tf` files |

#### Cloud Platforms
| ID | Name | Technologies | Indicators |
|----|------|--------------|------------|
| `cloud-aws` | AWS Specialist | Lambda, ECS, S3, RDS, CDK | AWS SDK usage |
| `cloud-gcp` | GCP Specialist | Cloud Run, Firestore, BigQuery | GCP SDK usage |
| `cloud-azure` | Azure Specialist | Functions, Cosmos DB, AKS | Azure SDK usage |
| `cloud-vercel` | Vercel Specialist | Vercel, Edge functions | Vercel config |

#### CI/CD
| ID | Name | Technologies | Indicators |
|----|------|--------------|------------|
| `cicd-github` | GitHub Actions | Workflows, actions, runners | `.github/workflows` |
| `cicd-gitlab` | GitLab CI | Pipelines, runners | `.gitlab-ci.yml` |
| `cicd-jenkins` | Jenkins | Pipelines, Jenkinsfile | `Jenkinsfile` |

### Quality

#### Testing
| ID | Name | Technologies | Indicators |
|----|------|--------------|------------|
| `testing-unit` | Unit Testing | Jest, Vitest, pytest, JUnit | Test files |
| `testing-integration` | Integration Testing | Supertest, testcontainers | Integration tests |
| `testing-e2e` | E2E Testing | Playwright, Cypress, Puppeteer | E2E specs |
| `testing-visual` | Visual Testing | Percy, Chromatic, BackstopJS | Visual regression |
| `testing-performance` | Performance Testing | k6, Artillery, Lighthouse | Load tests |

#### Security
| ID | Name | Technologies | Indicators |
|----|------|--------------|------------|
| `security-appsec` | Application Security | OWASP, SAST, DAST | Security requirements |
| `security-auth` | Authentication | OAuth, JWT, OIDC, Passkeys | Auth requirements |
| `security-crypto` | Cryptography | Encryption, hashing, PKI | Crypto requirements |

### Mobile

| ID | Name | Technologies | Indicators |
|----|------|--------------|------------|
| `mobile-react-native` | React Native | React Native, Expo | `react-native` |
| `mobile-flutter` | Flutter | Flutter, Dart | `pubspec.yaml` |
| `mobile-ios` | iOS Native | Swift, SwiftUI, UIKit | `.swift`, Xcode |
| `mobile-android` | Android Native | Kotlin, Jetpack Compose | `.kt`, Android |

## Detection Heuristics

### File Pattern Analysis
```javascript
const patterns = {
  'frontend-react': ['*.jsx', '*.tsx', 'react', 'next.config'],
  'frontend-vue': ['*.vue', 'vue.config', 'nuxt.config'],
  'backend-node': ['server.js', 'app.js', 'express', 'fastify'],
  'backend-python': ['*.py', 'requirements.txt', 'pyproject.toml'],
  'infra-docker': ['Dockerfile', 'docker-compose.yml'],
  'testing-e2e': ['*.spec.ts', '*.e2e.ts', 'playwright.config']
};
```

### Dependency Analysis
```javascript
const dependencies = {
  'react': 'frontend-react',
  'vue': 'frontend-vue',
  'express': 'backend-node',
  'fastapi': 'backend-python',
  'playwright': 'testing-e2e'
};
```

### Keyword Analysis
```javascript
const keywords = {
  'authentication': ['security-auth'],
  'real-time': ['api-websocket'],
  'machine learning': ['data-ml'],
  'scale': ['infra-kubernetes', 'cloud-aws']
};
```
