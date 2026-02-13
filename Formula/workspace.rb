# Homebrew formula for workspace-cli
# Install: brew install kenleytomlin/tap/workspace

class Workspace < Formula
  desc "Buildpacks for agent-friendly git repos"
  homepage "https://github.com/kenleytomlin/workspace-cli"
  version "0.3.1"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/kenleytomlin/workspace-cli/releases/download/v#{version}/workspace-darwin-arm64.tar.gz"
      sha256 "PLACEHOLDER_ARM64_SHA256"
    end
    on_intel do
      url "https://github.com/kenleytomlin/workspace-cli/releases/download/v#{version}/workspace-darwin-x64.tar.gz"
      sha256 "PLACEHOLDER_X64_SHA256"
    end
  end

  on_linux do
    url "https://github.com/kenleytomlin/workspace-cli/releases/download/v#{version}/workspace-linux-x64.tar.gz"
    sha256 "PLACEHOLDER_LINUX_SHA256"
  end

  def install
    if OS.mac?
      if Hardware::CPU.arm?
        bin.install "workspace-darwin-arm64" => "workspace"
      else
        bin.install "workspace-darwin-x64" => "workspace"
      end
    else
      bin.install "workspace-linux-x64" => "workspace"
    end
  end

  test do
    system "#{bin}/workspace", "--version"
  end
end
