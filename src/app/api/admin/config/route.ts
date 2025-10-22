import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdmin } from "@/lib/admin-auth";

interface SystemConfig {
  ai: {
    model: "gemini-2.0-flash" | "gemini-2.0-pro";
    maxTokens: number;
    temperature: number;
    rateLimit: {
      requestsPerUser: number;
      timeWindowMinutes: number;
    };
  };
  features: {
    imageAnalysis: boolean;
    offlineMode: boolean;
    aiAssistant: boolean;
    exportData: boolean;
  };
  costs: {
    monthlyBudget: number;
    alertThreshold: number; // percentage of budget
    alertEmail?: string;
  };
  maintenance: {
    mode: boolean;
    message: string;
  };
  lastUpdated: string;
  updatedBy: string;
}

const DEFAULT_CONFIG: SystemConfig = {
  ai: {
    model: "gemini-2.0-flash",
    maxTokens: 2048,
    temperature: 0.7,
    rateLimit: {
      requestsPerUser: 100,
      timeWindowMinutes: 60,
    },
  },
  features: {
    imageAnalysis: true,
    offlineMode: true,
    aiAssistant: true,
    exportData: true,
  },
  costs: {
    monthlyBudget: 100, // $100 default budget
    alertThreshold: 80, // Alert at 80% of budget
  },
  maintenance: {
    mode: false,
    message: "",
  },
  lastUpdated: new Date().toISOString(),
  updatedBy: "system",
};

// GET - Get current system configuration
export async function GET() {
  try {
    // Check admin authentication
    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get config from Firestore
    const configRef = doc(db, "system", "config");
    const configDoc = await getDoc(configRef);

    if (!configDoc.exists()) {
      // Return default config if not found
      return NextResponse.json({
        success: true,
        config: DEFAULT_CONFIG,
        isDefault: true,
      });
    }

    return NextResponse.json({
      success: true,
      config: configDoc.data() as SystemConfig,
      isDefault: false,
    });

  } catch (error) {
    console.error("Error fetching config:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch config",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST - Update system configuration
export async function POST(request: NextRequest) {
  try {
    // Check admin authentication
    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const updates = await request.json();

    // Get current config
    const configRef = doc(db, "system", "config");
    const configDoc = await getDoc(configRef);
    
    const currentConfig = configDoc.exists() 
      ? (configDoc.data() as SystemConfig)
      : DEFAULT_CONFIG;

    // Merge updates with current config
    const newConfig: SystemConfig = {
      ...currentConfig,
      ...updates,
      lastUpdated: new Date().toISOString(),
      updatedBy: "admin", // In a real app, use actual admin user ID
    };

    // Validate config
    if (newConfig.ai.maxTokens < 100 || newConfig.ai.maxTokens > 10000) {
      return NextResponse.json(
        { error: "maxTokens must be between 100 and 10000" },
        { status: 400 }
      );
    }

    if (newConfig.ai.temperature < 0 || newConfig.ai.temperature > 2) {
      return NextResponse.json(
        { error: "temperature must be between 0 and 2" },
        { status: 400 }
      );
    }

    if (newConfig.costs.alertThreshold < 0 || newConfig.costs.alertThreshold > 100) {
      return NextResponse.json(
        { error: "alertThreshold must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Save to Firestore
    await setDoc(configRef, newConfig);

    return NextResponse.json({
      success: true,
      config: newConfig,
      message: "Configuration updated successfully",
    });

  } catch (error) {
    console.error("Error updating config:", error);
    return NextResponse.json(
      {
        error: "Failed to update config",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

