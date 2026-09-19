# AllGo

[![AllGo CI](https://github.com/sualihiddris/allgo/actions/workflows/ci.yml/badge.svg)](https://github.com/sualihiddris/allgo/actions/workflows/ci.yml)

**Trusted Rides. Reliable Delivery. Built for communities often left out of mainstream mobility platforms.**

AllGo is a mobility and delivery platform designed for smaller cities, towns, and underserved communities where conventional ride-hailing services may have limited coverage.

The platform supports motorcycles, tricycles, delivery services, and assisted trip creation for customers who may not use smartphones.

> **Project status:** Active development. Interfaces, workflows, and operational assumptions may change while the platform is hardened for real-world deployment.

## Why AllGo?

Most mainstream ride-hailing platforms are designed around smartphone-first users in major cities.

In many smaller communities, transportation works differently. Motorcycles and tricycles play a major role, smartphone adoption is uneven, and some customers still prefer to arrange trips by phone.

AllGo is being built around that reality.

## Core Features

- Customer ride booking
- Motorcycle and tricycle support
- Driver application
- Real-time trip tracking
- Driver dispatch and trip lifecycle management
- Delivery requests
- Assisted call-in trip creation
- Administrative dashboard
- Driver and customer management
- Driver subscription management
- Branch-based operations
- Ratings and feedback
- Location and mapping integration
- Real-time communication with Socket.IO

## Assisted Booking

One of AllGo's key design decisions is supporting customers who cannot or do not want to use a smartphone application.

A customer can call an AllGo operator, who can create a trip on their behalf through the administrative platform.

This allows the service to support both digital users and customers who rely primarily on phone calls.

## Vehicle Types

AllGo currently supports mobility models common in Ghanaian communities, including:

- Motorcycles
- Keke / Pragya
- Aboboya / Motor King

The architecture allows additional vehicle types to be introduced as the platform expands.

## Platform Architecture

AllGo is organized as a monorepo containing four primary applications.

```text
allgo/
├── apps/
│   ├── customer/       # Expo / React Native customer application
│   ├── driver/         # Expo / React Native driver application
│   └── admin/          # Web-based administrative dashboard
├── server/             # Backend API and real-time services
├── shared/             # Shared types, constants and utilities
├── scripts/            # Development and project utilities
└── docs/               # Project documentation
```

## Development

Requirements:

- Node.js 18 or newer
- npm 10

Install workspace dependencies:

```bash
npm ci
```

Common validation commands:

```bash
npm run typecheck
npm --workspace @allgo/server test
npm --workspace @allgo/server run build
```

See [TESTING.md](TESTING.md) for the testing strategy and environment-specific validation.

## Contributing

Contributions should be focused, tested, and submitted through pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, validation expectations, and review guidance.

## Security

Do not disclose exploitable vulnerabilities in public issues. See [SECURITY.md](SECURITY.md) for responsible disclosure guidance.
