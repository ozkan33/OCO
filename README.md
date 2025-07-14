# 3B Vendor Portal

A modern Next.js-based vendor management portal with advanced data grid functionality, authentication, and real-time data management capabilities.

## 🚀 Features

### Core Functionality
- **Advanced Data Grid**: Interactive data grid with Excel/CSV import/export capabilities
- **Subgrid Support**: Expandable subgrids for detailed data management
- **Template System**: Save and import grid templates for both main grid and subgrids
- **Real-time Validation**: Column validation and data integrity checks
- **Custom Editors**: Dropdown selectors, date pickers, and inline editing
- **Authentication**: JWT-based authentication system with role-based access

### Data Management
- **Vendor Management**: Complete vendor lifecycle management
- **Retailer Tracking**: Retailer information and relationship management
- **Order Processing**: Order creation, tracking, and management
- **Brand Management**: Product brand and inventory tracking
- **Notes System**: Comprehensive note-taking for retailers and vendors
- **Feedback System**: Vendor feedback collection and management

### UI/UX Features
- **Responsive Design**: Mobile-friendly interface with Tailwind CSS
- **Modern UI**: Clean, professional interface with intuitive navigation
- **Toast Notifications**: Real-time feedback using Sonner
- **Loading States**: Smooth user experience with proper loading indicators
- **Error Handling**: Comprehensive error handling and user feedback

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with bcrypt password hashing
- **Data Grid**: React Data Grid with custom enhancements
- **File Processing**: XLSX for Excel/CSV import/export
- **Validation**: Zod for schema validation
- **Icons**: React Icons
- **UI Components**: React Select, Swiper

## 📋 Prerequisites

Before running this project, ensure you have:

- **Node.js** (v18 or higher)
- **npm** or **yarn** package manager
- **PostgreSQL** database server
- **Git** for version control

## 🚀 Installation

### 1. Clone the Repository
```bash
git clone https://github.com/ozkan33/3BS.git
cd 3BS/vendor-portal
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory:
```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/vendor_portal"

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key-here"

# Next.js Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret-here"
```

### 4. Database Setup
```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# (Optional) Seed the database with initial data
npx prisma db seed
```

### 5. Start Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## 📁 Project Structure

```
vendor-portal/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── admin/             # Admin dashboard pages
│   │   ├── api/               # API routes
│   │   ├── auth/              # Authentication pages
│   │   └── orders/            # Order management pages
│   ├── components/            # Reusable React components
│   │   ├── admin/            # Admin-specific components
│   │   ├── auth/             # Authentication components
│   │   └── layout/           # Layout components
│   └── middleware.ts         # Next.js middleware
├── prisma/                   # Database schema and migrations
├── lib/                      # Utility functions and configurations
├── public/                   # Static assets
└── scripts/                  # Utility scripts
```

## 🔧 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npx prisma studio` - Open Prisma Studio for database management
- `npx prisma migrate dev` - Run database migrations
- `npx prisma generate` - Generate Prisma client

## 🗄️ Database Schema

The application uses PostgreSQL with the following main entities:

- **Vendor**: Core vendor information and authentication
- **Retailer**: Retailer details and vendor relationships
- **Order**: Order management and tracking
- **Brand**: Product brand information
- **Note**: Notes and comments system
- **Feedback**: Vendor feedback collection

## 🔐 Authentication

The application uses JWT-based authentication with:
- Secure password hashing using bcrypt
- Role-based access control
- Email verification system
- Session management

## 📊 Data Grid Features

### Main Grid
- Custom column management
- Excel/CSV import/export
- Template save/load functionality
- Inline editing with validation
- Sorting and filtering

### Subgrids
- Expandable subgrids per main row
- Independent template system
- Custom column management
- Real-time data updates

## 🚀 Deployment

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Other Platforms
- Ensure PostgreSQL database is accessible
- Set all required environment variables
- Build and deploy using platform-specific instructions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is private and proprietary.

## 🆘 Support

For support and questions:
- Check the existing issues
- Create a new issue with detailed information
- Contact the development team

## 🔄 Version History

- **v0.1.0**: Initial release with core functionality
- Advanced data grid with subgrid support
- Authentication system
- Template management
- Excel/CSV import/export

---

**Note**: This is a private project. Please ensure all sensitive information is properly secured and not committed to version control.
