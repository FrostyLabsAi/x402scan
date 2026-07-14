-- Add HyperEVM to the accepted x402 payment networks
ALTER TYPE "AcceptsNetwork" ADD VALUE IF NOT EXISTS 'hyperevm';
