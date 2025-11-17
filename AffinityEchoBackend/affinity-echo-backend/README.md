# Affinity Echo Backend

An anonymous-first professional networking platform built for underrepresented communities in tech. This backend system powers forums, mentorship, job referrals, and secure messaging with a focus on privacy and progressive identity revelation.

## 🚀 Features

- **Anonymous Forums**: Safe spaces for authentic conversations
- **Progressive Identity Revelation**: Control when and to whom you reveal your identity
- **Referral Marketplace**: Connect job seekers with referral opportunities
- **Mentorship Platform**: Structured mentor-mentee matching
- **Secure Messaging**: End-to-end encrypted communications
- **Microservices Architecture**: Scalable and maintainable
- **Real-time Notifications**: Live updates across all features

## 🏗️ Architecture

This project uses a microservices architecture with the following services:

- **API Gateway**: Single entry point, request routing, and rate limiting
- **Auth Service**: Authentication, authorization, and session management
- **User Service**: User profiles, onboarding, and privacy settings
- **Forum Service**: Anonymous discussions and community engagement
- **Referral Service**: Job referral marketplace and connections
- **Mentorship Service**: Mentor matching and session management
- **Messaging Service**: Real-time encrypted messaging
- **Notification Service**: Push, email, and in-app notifications
- **Search Service**: Full-text search across platform content

## 🛠️ Tech Stack

- **Framework**: NestJS with TypeScript
- **Database**: PostgreSQL with Supabase
- **Cache**: Redis
- **Message Queue**: Redis (Bull Queue)
- **API Documentation**: OpenAPI/Swagger
- **Testing**: Jest with Supertest
- **Containerization**: Docker & Docker Compose
- **Monitoring**: Prometheus, Grafana, Jaeger

## 📦 Quick Start

### Prerequisites

- Node.js 18+ 
- npm 9+
- Docker & Docker Compose
- Supabase account (for authentication)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/affinity-echo-backend.git
   cd affinity-echo-backend